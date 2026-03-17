/**
 * useRates Hook - 3-tier Rate Fetching Pipeline
 * 
 * Tier 1: Memory cache (in-session)
 * Tier 2: Bulk cached endpoint (/api/rates/cached/bulk)
 * Tier 3: Live ShipStation endpoint (/api/rates) with 2-at-a-time batching
 * 
 * Race condition guards:
 * - AbortController for request cancellation
 * - Fetch ID counter to discard stale responses
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { OrderDTO, RatesMap, RateGroup } from '../types/orders';
import { groupOrdersByRateKey } from '../utils/rates';
import { useAbortSignal } from './useAbortSignal';
import { apiClient } from '../api/client';

interface UseRatesState {
  rates: RatesMap;
  loading: boolean;
  error: Error | null;
}

const BATCH_SIZE = 2;
const BATCH_DELAY = 200; // ms between batches
const LIVE_RETRY_COUNT = 2;
const LIVE_RETRY_DELAY = 1500; // ms

export function useRatesV3(orders: OrderDTO[]): UseRatesState {
  const [rates, setRates] = useState<RatesMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const memCacheRef = useRef<RatesMap>({});
  const fetchIdRef = useRef(0);
  const { createSignal, abort } = useAbortSignal();

  /**
   * Enrich orders with SKU defaults from product DB
   * This fills in missing weight/dims from product database
   */
  const enrichOrders = useCallback(async (
    ordersToEnrich: OrderDTO[],
    signal: AbortSignal
  ): Promise<OrderDTO[]> => {
    const needsDefault = ordersToEnrich.filter(o => {
      const hasWt = (o.weight?.value ?? 0) > 0;
      const dims = o.dimensions;
      const hasDims = dims && 
        dims.length > 0 && 
        dims.width > 0 && 
        dims.height > 0;
      const hasItems = o.items && o.items.length > 0;
      return (!hasWt || !hasDims) && hasItems;
    });

    if (needsDefault.length === 0) return ordersToEnrich;

    try {
      const skus = new Set<string>();
      needsDefault.forEach(o => {
        o.items?.forEach(i => {
          if (!i.adjustment) skus.add(i.sku);
        });
      });

      if (skus.size === 0) return ordersToEnrich;

      const prodMap = await apiClient.getProductBulk([...skus], { signal });

      return ordersToEnrich.map(o => {
        if (!needsDefault.includes(o)) return o;

        const items = (o.items ?? []).filter(i => !i.adjustment);
        const uniqueSkus = [...new Set(items.map(i => i.sku))];
        if (uniqueSkus.length !== 1) return o;

        const prod = prodMap[uniqueSkus[0]];
        if (!prod) return o;

        const qty = items.reduce((sum, i) => sum + (i.quantity ?? 1), 0);

        const enriched = { ...o };
        if (!enriched.weight || enriched.weight.value === 0) {
          enriched._enrichedWeight = {
            value: parseFloat((prod.weightOz * qty).toFixed(2)),
            units: 'ounces' as const
          };
        }
        if (!enriched.dimensions || enriched.dimensions.length === 0) {
          enriched._enrichedDims = {
            length: prod.length,
            width: prod.width,
            height: prod.height
          };
        }

        return enriched;
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      console.warn('Failed to enrich orders with product defaults:', err);
      return ordersToEnrich;
    }
  }, []);

  /**
   * Main 3-tier fetch pipeline
   */
  const fetchRates = useCallback(async (ordersToFetch: OrderDTO[]) => {
    const myFetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const signal = createSignal();

      // Enrich orders first
      const enriched = await enrichOrders(ordersToFetch, signal);

      if (signal.aborted || myFetchId !== fetchIdRef.current) return;

      // Group orders by rate key
      const groups = groupOrdersByRateKey(enriched);
      if (groups.length === 0) {
        setLoading(false);
        return;
      }

      const results: RatesMap = {};

      // Tier 1: Check memory cache
      const tier2Groups: RateGroup[] = [];
      groups.forEach(g => {
        if (memCacheRef.current[g.key]) {
          results[g.key] = memCacheRef.current[g.key];
        } else {
          tier2Groups.push(g);
        }
      });

      if (tier2Groups.length === 0) {
        if (myFetchId === fetchIdRef.current) {
          setRates(results);
        }
        setLoading(false);
        return;
      }

      // Tier 2: Bulk cached endpoint
      if (signal.aborted || myFetchId !== fetchIdRef.current) return;

      try {
        const bulkResponse = await apiClient.fetchRatesCachedBulk(tier2Groups, { signal });

        if (signal.aborted || myFetchId !== fetchIdRef.current) return;

        const tier3Groups: RateGroup[] = [];
        tier2Groups.forEach(g => {
          const cached = bulkResponse.results?.[g.key];
          if (cached?.rates && cached.rates.length > 0) {
            memCacheRef.current[g.key] = cached.rates;
            results[g.key] = cached.rates;
          } else {
            tier3Groups.push(g);
          }
        });

        // Tier 3: Live fetch with 2-at-a-time batching
        if (tier3Groups.length > 0 && (myFetchId === fetchIdRef.current)) {
          for (let i = 0; i < tier3Groups.length; i += BATCH_SIZE) {
            if (signal.aborted || myFetchId !== fetchIdRef.current) return;

            const batch = tier3Groups.slice(i, i + BATCH_SIZE);

            const promises = batch.map(async (g) => {
              if (signal.aborted || myFetchId !== fetchIdRef.current) return;

              try {
                for (let attempt = 0; attempt < LIVE_RETRY_COUNT; attempt++) {
                  if (attempt > 0) {
                    await new Promise(r => setTimeout(r, LIVE_RETRY_DELAY));
                  }

                  if (signal.aborted || myFetchId !== fetchIdRef.current) return;

                  const liveRates = await apiClient.fetchRatesLive(
                    {
                      fromPostalCode: '90248',
                      toPostalCode: g.zip,
                      toCountry: 'US',
                      weight: { value: g.wt, units: 'ounces' as const },
                      dimensions: g.dims ? {
                        length: g.dims.length,
                        width: g.dims.width,
                        height: g.dims.height
                      } : undefined,
                      residential: g.residential,
                      orderIds: g.ids,
                      storeId: g.storeId
                    },
                    { signal }
                  );

                  if (liveRates && liveRates.length > 0) {
                    memCacheRef.current[g.key] = liveRates;
                    results[g.key] = liveRates;
                    return;
                  }
                }
              } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') return;
                console.error(`[useRates] Failed to fetch live rates for key ${g.key}:`, err);
              }
            });

            await Promise.all(promises);

            // Stagger batches
            if (i + BATCH_SIZE < tier3Groups.length) {
              await new Promise(r => setTimeout(r, BATCH_DELAY));
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        // Partial failure in bulk cache — continue with live fetching
        console.warn('[useRates] Bulk cache fetch failed, falling back to live:', err);
      }

      // Update state only if this fetch is still current
      if (myFetchId === fetchIdRef.current) {
        setRates(results);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (myFetchId === fetchIdRef.current) {
        setError(err as Error);
        console.error('[useRates] Fetch error:', err);
      }
    } finally {
      if (myFetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [enrichOrders, createSignal]);

  // Trigger fetch when orders change
  useEffect(() => {
    if (orders.length > 0) {
      fetchRates(orders);
    } else {
      setRates({});
      setLoading(false);
    }
  }, [orders, fetchRates]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abort();
    };
  }, [abort]);

  return { rates, loading, error };
}
