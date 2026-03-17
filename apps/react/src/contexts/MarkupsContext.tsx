/**
 * MarkupsContext
 * Manages per-carrier markup state and persistence
 */

import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import type { MarkupsMap, Markup, MarkupType } from '../types/markups';

const MARKUP_STORAGE_KEY = 'prepship_rb_markups';
const API_BASE = '/api';

export interface MarkupsContextValue {
  // State
  markups: MarkupsMap;
  loading: boolean;
  error: string | null;

  // Methods
  applyMarkup(basePrice: number, markup: Markup): number;
  saveMarkup(pidOrCarrier: number | string, type: MarkupType, value: number): Promise<void>;
  clearRateCache(): Promise<void>;
  refreshMarkups(): Promise<void>;
}

const MarkupsContext = createContext<MarkupsContextValue | null>(null);

export function MarkupsProvider({ children }: { children: React.ReactNode }) {
  const [markups, setMarkups] = useState<MarkupsMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markupsRef = useRef<MarkupsMap>({});

  // Keep ref in sync
  useEffect(() => {
    markupsRef.current = markups;
  }, [markups]);

  // Load markups on mount
  useEffect(() => {
    loadMarkups();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  async function loadMarkups() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/settings/rbMarkups`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MarkupsMap = await res.json();
      setMarkups(data || {});
      // Sync to localStorage
      localStorage.setItem(MARKUP_STORAGE_KEY, JSON.stringify(data || {}));
      setError(null);
    } catch (err) {
      console.error('Failed to load markups:', err);
      // Fallback to localStorage
      try {
        const cached = localStorage.getItem(MARKUP_STORAGE_KEY);
        if (cached) {
          setMarkups(JSON.parse(cached));
        }
      } catch (parseErr) {
        console.error('Failed to parse cached markups:', parseErr);
      }
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const applyMarkup = useCallback((basePrice: number, markup: Markup): number => {
    if (!markup || !markup.value) return basePrice;
    return markup.type === 'pct'
      ? basePrice * (1 + markup.value / 100)
      : basePrice + markup.value;
  }, []);

  const clearRateCache = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/cache/clear-and-refetch`, { method: 'POST' });
    } catch (err) {
      console.warn('Failed to clear rate cache:', err);
    }
  }, []);

  const saveMarkup = useCallback(
    async (pidOrCarrier: number | string, type: MarkupType, value: number) => {
      // Optimistically update state
      setMarkups(prev => ({
        ...prev,
        [pidOrCarrier]: { type, value }
      }));

      // Debounce the API call
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(async () => {
        try {
          const updated = { ...markupsRef.current, [pidOrCarrier]: { type, value } };
          const res = await fetch(`${API_BASE}/settings/rbMarkups`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          // Sync to localStorage
          localStorage.setItem(MARKUP_STORAGE_KEY, JSON.stringify(updated));

          // Invalidate rate cache
          await clearRateCache();
        } catch (err) {
          console.error('Failed to save markup:', err);
          setError((err as Error).message);
          // Revert on failure
          setMarkups(prev => {
            const reverted = { ...prev };
            delete reverted[pidOrCarrier];
            return reverted;
          });
        }
      }, 600);
    },
    [clearRateCache]
  );

  const refreshMarkups = useCallback(() => loadMarkups(), []);

  const value: MarkupsContextValue = {
    markups,
    loading,
    error,
    applyMarkup,
    saveMarkup,
    clearRateCache,
    refreshMarkups
  };

  return (
    <MarkupsContext.Provider value={value}>
      {children}
    </MarkupsContext.Provider>
  );
}

export function useMarkups(): MarkupsContextValue {
  const ctx = React.useContext(MarkupsContext);
  if (!ctx) throw new Error('useMarkups called outside MarkupsProvider');
  return ctx;
}
