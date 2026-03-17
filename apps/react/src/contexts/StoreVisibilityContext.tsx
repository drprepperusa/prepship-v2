/**
 * StoreVisibilityContext — Sidebar visibility state for stores
 * 
 * Manages which stores are shown/hidden in the sidebar
 * Persists state to localStorage (key: prepship_store_visibility)
 * Format: {"1": true, "3": false, "10": true}
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

interface StoreVisibilityContextValue {
  visibilityState: Record<number, boolean>
  useStoreVisibility: (clientId: number) => boolean
  toggleStoreVisibility: (clientId: number) => void
}

const StoreVisibilityContext = createContext<StoreVisibilityContextValue | null>(null)

const STORAGE_KEY = 'prepship_store_visibility'

export function StoreVisibilityProvider({ children }: { children: ReactNode }) {
  const [visibilityState, setVisibilityState] = useState<Record<number, boolean>>({})
  const [isInitialized, setIsInitialized] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const parsed = stored ? JSON.parse(stored) : {}
      setVisibilityState(parsed)
    } catch (err) {
      console.error('[StoreVisibilityContext] Failed to load from localStorage:', err)
      setVisibilityState({})
    } finally {
      setIsInitialized(true)
    }
  }, [])

  // Persist to localStorage whenever state changes
  useEffect(() => {
    if (isInitialized) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(visibilityState))
      } catch (err) {
        console.error('[StoreVisibilityContext] Failed to save to localStorage:', err)
      }
    }
  }, [visibilityState, isInitialized])

  const useStoreVisibility = useCallback((clientId: number): boolean => {
    // Default to true (visible) if not explicitly set
    return visibilityState[clientId] !== false
  }, [visibilityState])

  const toggleStoreVisibility = useCallback((clientId: number) => {
    setVisibilityState(prev => ({
      ...prev,
      [clientId]: !useStoreVisibility(clientId),
    }))
  }, [useStoreVisibility])

  return (
    <StoreVisibilityContext.Provider
      value={{
        visibilityState,
        useStoreVisibility,
        toggleStoreVisibility,
      }}
    >
      {children}
    </StoreVisibilityContext.Provider>
  )
}

export function useStoreVisibilityContext(): StoreVisibilityContextValue {
  const ctx = useContext(StoreVisibilityContext)
  if (!ctx) throw new Error('useStoreVisibilityContext must be used within StoreVisibilityProvider')
  return ctx
}
