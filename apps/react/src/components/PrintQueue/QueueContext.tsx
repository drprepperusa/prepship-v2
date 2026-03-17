/**
 * QueueContext — Print queue state management
 * 
 * DB-first architecture: localStorage is 5-minute fallback cache only
 * 30s cross-tab sync via polling
 * useEffect cleanup for all intervals/timers
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { useStores } from '../../contexts/StoresContext'

export interface QueueItem {
  queueId: string
  orderId: number
  orderNumber: string
  labelId?: string
  labelUrl?: string
  storeId?: number
  quantity: number
  notes?: string
  status: 'pending' | 'printed' | 'error'
  sku?: string
  skuName?: string
  addedAt: number
  printCount?: number
}

interface QueueContextValue {
  queue: QueueItem[]
  count: number
  addToQueue: (item: Omit<QueueItem, 'queueId' | 'status' | 'addedAt'>) => Promise<void>
  removeFromQueue: (queueId: string) => Promise<void>
  markPrinted: (queueId: string) => void
  clearPrinted: () => void
  clearAll: () => Promise<void>
  refreshQueue: () => Promise<void>
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const QueueContext = createContext<QueueContextValue | null>(null)

const STORAGE_KEY = 'prepship_print_queue'
const CACHE_TS_KEY = 'prepship_print_queue_ts'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const POLL_INTERVAL_MS = 30_000 // 30s cross-tab sync

function parseServerItems(raw: unknown[]): QueueItem[] {
  return raw.map((item: any) => ({
    queueId: String(item.id || item.queueId || Math.random()),
    orderId: Number(item.order_id || item.orderId),
    orderNumber: String(item.order_number || item.orderNumber || `#${item.order_id || item.orderId}`),
    labelId: item.label_id || item.labelId || undefined,
    labelUrl: item.label_url || item.labelUrl || undefined,
    storeId: item.store_id || item.storeId || undefined,
    quantity: Number(item.order_qty || item.quantity || 1),
    notes: item.notes || undefined,
    status: (item.status as QueueItem['status']) || 'pending',
    sku: item.primary_sku || item.sku || undefined,
    skuName: item.item_description || item.skuName || undefined,
    addedAt: item.created_at ? new Date(item.created_at).getTime() : (item.addedAt || Date.now()),
    printCount: item.print_count || 0,
  }))
}

function loadFromLocalStorage(): QueueItem[] {
  try {
    const ts = localStorage.getItem(CACHE_TS_KEY)
    const age = ts ? Date.now() - parseInt(ts, 10) : Infinity
    if (age > CACHE_TTL_MS) return []
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveToLocalStorage(items: QueueItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    localStorage.setItem(CACHE_TS_KEY, String(Date.now()))
  } catch {}
}

export function QueueProvider({ children }: { children: ReactNode }) {
  // Init from localStorage (stale fallback) while DB loads
  const [queue, setQueue] = useState<QueueItem[]>(loadFromLocalStorage)
  const [isOpen, setIsOpen] = useState(false)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastCountRef = useRef<number>(-1)
  const { selectedStoreId } = useStores()

  // Hydrate from DB on mount — uses selectedStoreId from context
  const refreshQueue = useCallback(async (clientId?: number) => {
    const cid = clientId ?? selectedStoreId ?? 1
    try {
      const res = await fetch(`/api/queue?client_id=${cid}`)
      if (!res.ok) return
      const data = await res.json()
      const serverItems = parseServerItems(Array.isArray(data) ? data : data.items || data.queue || data.orders || [])
      setQueue(serverItems)
      saveToLocalStorage(serverItems)
    } catch {
      // Fall back to localStorage (already loaded in initial state)
    }
  }, [selectedStoreId])

  // Mount: load from DB
  useEffect(() => {
    void refreshQueue()
  }, [refreshQueue])

  // 30s polling when queue panel is open — only re-render if count changed
  useEffect(() => {
    if (!isOpen) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
      return
    }

    const poll = async () => {
      const cid = selectedStoreId ?? 1
      try {
        const res = await fetch(`/api/queue?client_id=${cid}`)
        if (!res.ok) return
        const data = await res.json()
        const serverItems = parseServerItems(Array.isArray(data) ? data : data.items || data.queue || data.orders || [])
        const pendingCount = serverItems.filter(i => i.status === 'pending').length
        if (pendingCount !== lastCountRef.current) {
          lastCountRef.current = pendingCount
          setQueue(serverItems)
          saveToLocalStorage(serverItems)
        }
      } catch {}
    }

    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [isOpen, selectedStoreId])

  const addToQueue = useCallback(async (item: Omit<QueueItem, 'queueId' | 'status' | 'addedAt'>) => {
    const newItem: QueueItem = {
      ...item,
      queueId: `${item.orderId}-${Date.now()}`,
      status: 'pending',
      addedAt: Date.now(),
    }

    // Optimistic update
    setQueue(prev => {
      if (prev.some(q => q.orderId === item.orderId)) return prev
      const next = [...prev, newItem]
      saveToLocalStorage(next)
      return next
    })

    // Persist to DB
    try {
      const cid = selectedStoreId ?? 1
      await fetch('/api/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: String(item.orderId),
          order_number: item.orderNumber,
          label_url: item.labelUrl || '',
          primary_sku: item.sku || null,
          item_description: item.skuName || null,
          order_qty: item.quantity || 1,
          store_id: item.storeId || null,
          notes: item.notes || null,
          client_id: cid,
        }),
      })
      // Refresh to get server-assigned ID
      await refreshQueue(cid)
    } catch {
      // localStorage already updated, continue
    }
  }, [refreshQueue])

  const removeFromQueue = useCallback(async (queueId: string) => {
    setQueue(prev => {
      const next = prev.filter(q => q.queueId !== queueId)
      saveToLocalStorage(next)
      return next
    })
    try {
      await fetch(`/api/queue/${queueId}`, { method: 'DELETE' })
    } catch {}
  }, [])

  const markPrinted = useCallback((queueId: string) => {
    setQueue(prev => {
      const next = prev.map(q => q.queueId === queueId ? { ...q, status: 'printed' as const } : q)
      saveToLocalStorage(next)
      return next
    })
  }, [])

  const clearPrinted = useCallback(() => {
    setQueue(prev => {
      const next = prev.filter(q => q.status !== 'printed')
      saveToLocalStorage(next)
      return next
    })
  }, [])

  const clearAll = useCallback(async () => {
    setQueue([])
    saveToLocalStorage([])
    try {
      await fetch('/api/queue/clear', { method: 'POST' })
    } catch {}
  }, [])

  const count = queue.filter(q => q.status === 'pending').length

  return (
    <QueueContext.Provider value={{
      queue,
      count,
      addToQueue,
      removeFromQueue,
      markPrinted,
      clearPrinted,
      clearAll,
      refreshQueue,
      isOpen,
      setIsOpen,
    }}>
      {children}
    </QueueContext.Provider>
  )
}

export function useQueue() {
  const ctx = useContext(QueueContext)
  if (!ctx) throw new Error('useQueue must be used within QueueProvider')
  return ctx
}
