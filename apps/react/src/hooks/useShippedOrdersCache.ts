import { useState, useEffect, useCallback } from 'react'

const CACHE_KEY = 'prepship_shipped_orders'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const BUILD_ID = import.meta.env.VITE_BUILD_ID || '1'

interface CacheEntry {
  orders: any[]
  timestamp: number
  buildId: string
}

export function useShippedOrdersCache() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [fromCache, setFromCache] = useState(false)

  const readCache = (): CacheEntry | null => {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (!raw) return null
      const entry: CacheEntry = JSON.parse(raw)
      // Invalidate if too old or build ID changed
      if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null
      if (entry.buildId !== BUILD_ID) return null
      return entry
    } catch {
      return null
    }
  }

  const writeCache = (orders: any[]) => {
    try {
      const entry: CacheEntry = { orders, timestamp: Date.now(), buildId: BUILD_ID }
      localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
    } catch {
      // Ignore storage errors
    }
  }

  const fetchFresh = useCallback(async () => {
    try {
      const res = await fetch('/api/orders?orderStatus=shipped&pageSize=500')
      if (!res.ok) return
      const data = await res.json()
      const freshOrders = data.orders || data || []
      setOrders(freshOrders)
      writeCache(freshOrders)
      setFromCache(false)
    } catch (err) {
      console.error('[useShippedOrdersCache]', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Try cache first for fast display
    const cached = readCache()
    if (cached) {
      setOrders(cached.orders)
      setFromCache(true)
      setLoading(false)
      // Fetch fresh in background
      fetchFresh()
    } else {
      fetchFresh()
    }
  }, [fetchFresh])

  const invalidateCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY)
  }, [])

  return { orders, loading, fromCache, invalidateCache, refresh: fetchFresh }
}
