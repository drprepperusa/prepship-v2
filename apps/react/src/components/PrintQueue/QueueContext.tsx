import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

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
}

interface QueueContextValue {
  queue: QueueItem[]
  count: number
  addToQueue: (item: Omit<QueueItem, 'queueId' | 'status' | 'addedAt'>) => Promise<void>
  removeFromQueue: (queueId: string) => Promise<void>
  markPrinted: (queueId: string) => void
  clearPrinted: () => void
  clearAll: () => void
  refreshQueue: () => Promise<void>
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const QueueContext = createContext<QueueContextValue | null>(null)

const STORAGE_KEY = 'prepship_print_queue'

export function QueueProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [isOpen, setIsOpen] = useState(false)

  // Sync to localStorage whenever queue changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  }, [queue])

  // Also load from server on mount
  const refreshQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/print-queue')
      if (!res.ok) return
      const data = await res.json()
      const serverItems: QueueItem[] = (data.items || data || []).map((item: any) => ({
        queueId: String(item.queueId || item.id || Math.random()),
        orderId: item.orderId,
        orderNumber: item.orderNumber || `#${item.orderId}`,
        labelId: item.labelId,
        labelUrl: item.labelUrl,
        storeId: item.storeId,
        quantity: item.quantity || 1,
        notes: item.notes,
        status: item.status || 'pending',
        sku: item.sku,
        skuName: item.skuName || item.name,
        addedAt: item.addedAt || Date.now(),
      }))
      if (serverItems.length > 0) {
        setQueue(serverItems)
      }
    } catch {
      // Fall back to localStorage
    }
  }, [])

  useEffect(() => {
    refreshQueue()
  }, [])

  const addToQueue = useCallback(async (item: Omit<QueueItem, 'queueId' | 'status' | 'addedAt'>) => {
    const newItem: QueueItem = {
      ...item,
      queueId: `${item.orderId}-${Date.now()}`,
      status: 'pending',
      addedAt: Date.now(),
    }

    setQueue(prev => {
      // Avoid duplicates
      if (prev.some(q => q.orderId === item.orderId)) return prev
      return [...prev, newItem]
    })

    // Also POST to server
    try {
      await fetch('/api/print-queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: item.orderId,
          labelId: item.labelId,
          storeId: item.storeId,
          quantity: item.quantity || 1,
          notes: item.notes,
        }),
      })
    } catch {
      // localStorage already updated, continue
    }
  }, [])

  const removeFromQueue = useCallback(async (queueId: string) => {
    setQueue(prev => prev.filter(q => q.queueId !== queueId))
    try {
      await fetch(`/api/print-queue/${queueId}`, { method: 'DELETE' })
    } catch {}
  }, [])

  const markPrinted = useCallback((queueId: string) => {
    setQueue(prev => prev.map(q => q.queueId === queueId ? { ...q, status: 'printed' as const } : q))
  }, [])

  const clearPrinted = useCallback(() => {
    setQueue(prev => prev.filter(q => q.status !== 'printed'))
  }, [])

  const clearAll = useCallback(() => {
    setQueue([])
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
