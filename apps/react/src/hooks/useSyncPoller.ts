import { useState, useEffect, useRef } from 'react'

export interface SyncStatus {
  syncing: boolean
  lastSyncAt: number | null
  lastSyncText: string
  error: string | null
}

function formatSyncAgo(ts: number | null): string {
  if (!ts) return 'Never synced'
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function useSyncPoller(enabled = true, intervalMs = 10000): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({
    syncing: false,
    lastSyncAt: null,
    lastSyncText: 'Loading…',
    error: null,
  })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSyncAtRef = useRef<number | null>(null)

  // Update the "X ago" text every 30 seconds
  useEffect(() => {
    textTimerRef.current = setInterval(() => {
      setStatus(prev => ({
        ...prev,
        lastSyncText: prev.syncing ? 'Syncing…' : formatSyncAgo(lastSyncAtRef.current),
      }))
    }, 30000)
    return () => { if (textTimerRef.current) clearInterval(textTimerRef.current) }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const poll = async () => {
      try {
        setStatus(prev => ({ ...prev, syncing: true, error: null }))
        const res = await fetch('/api/sync-status')
        if (res.ok) {
          const data = await res.json()
          const ts = data.lastSyncAt ? new Date(data.lastSyncAt).getTime() : Date.now()
          lastSyncAtRef.current = ts
          setStatus({
            syncing: !!data.syncing,
            lastSyncAt: ts,
            lastSyncText: data.syncing ? 'Syncing…' : formatSyncAgo(ts),
            error: null,
          })
        }
      } catch {
        setStatus(prev => ({
          ...prev,
          syncing: false,
          error: 'Sync error',
          lastSyncText: 'Sync error',
        }))
      }
    }

    poll()

    const schedule = () => {
      timerRef.current = setTimeout(async () => {
        await poll()
        schedule()
      }, intervalMs)
    }

    schedule()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [enabled, intervalMs])

  return status
}
