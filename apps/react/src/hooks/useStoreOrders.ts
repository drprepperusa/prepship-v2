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
      const counts: Record<number, number> = {};
      let page = 1;
      let hasMore = true;

      // Fetch all pages needed to get complete store breakdown
      // API has max pageSize of 500, so fetch sequentially until all orders are collected
      while (hasMore) {
        const response = await apiClient.listOrders({
          page,
          pageSize: 500,
          orderStatus: status,
        });

        response.orders.forEach((order) => {
          if (order.storeId !== null) {
            counts[order.storeId] = (counts[order.storeId] || 0) + 1;
          }
        });

        // Check if we've fetched all orders
        if (response.page >= response.pages) {
          hasMore = false;
        } else {
          page++;
        }
      }

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
