import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/client";
import type { OrderSummaryDto } from "@prepshipv2/contracts/orders/contracts";

export interface UseOrderDetailResult {
  order: OrderSummaryDto | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useOrderDetail(orderId: number | null): UseOrderDetailResult {
  const [order, setOrder] = useState<OrderSummaryDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!orderId) {
      setOrder(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await apiClient.getOrderDetail(orderId);
      setOrder(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to fetch order");
      setError(error);
      console.error("[useOrderDetail]", error);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [orderId, fetchOrder]);

  return {
    order,
    loading,
    error,
    refetch: fetchOrder,
  };
}
