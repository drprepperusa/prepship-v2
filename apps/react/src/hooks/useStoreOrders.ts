import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/client";
import type { ListOrdersResponse } from "@prepshipv2/contracts/orders/contracts";

export interface UseStoreOrdersResult {
  storeCounts: Record<number, number>;
  loading: boolean;
  error: Error | null;
}

export function useStoreOrders(status: string): UseStoreOrdersResult {
  const [storeCounts, setStoreCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchStoreCounts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Call server-side aggregation endpoint for instant results
      const response = await fetch(`/api/orders/store-counts?orderStatus=${encodeURIComponent(status)}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch store counts: ${response.statusText}`);
      }
      
      const counts = (await response.json()) as Record<number, number>;
      console.log(`[useStoreOrders] Fetched ${status}: ${Object.keys(counts).length} stores, total: ${Object.values(counts).reduce((a, b) => a + b, 0)} orders`);
      setStoreCounts(counts);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to fetch store orders");
      setError(error);
      console.error("[useStoreOrders]", error);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchStoreCounts();
  }, [status, fetchStoreCounts]);

  return { storeCounts, loading, error };
}
