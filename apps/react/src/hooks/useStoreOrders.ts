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
      // Fetch all orders for this status with a large page size to get store breakdown
      const response = await apiClient.listOrders({
        page: 1,
        pageSize: 5000,
        orderStatus: status,
      });

      const counts: Record<number, number> = {};
      response.orders.forEach((order) => {
        if (order.storeId !== null) {
          counts[order.storeId] = (counts[order.storeId] || 0) + 1;
        }
      });

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
