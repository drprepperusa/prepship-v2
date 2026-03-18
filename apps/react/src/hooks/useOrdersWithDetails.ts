import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/client";
import type { OrderSummaryDto } from "@prepshipv2/contracts/orders/contracts";

interface OrderWithDetails extends OrderSummaryDto {
  shippingAccountName?: string;
}

export interface UseOrdersWithDetailsResult {
  orders: OrderWithDetails[];
  total: number;
  pages: number;
  currentPage: number;
  loading: boolean;
  backgroundLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  goToPage: (page: number) => Promise<void>;
}

export function useOrdersWithDetails(
  status: string,
  options: { page?: number; pageSize?: number; dateStart?: string; dateEnd?: string; clientId?: number | null } = {}
): UseOrdersWithDetailsResult {
  const { page = 1, pageSize = 50, dateStart, dateEnd, clientId } = options;

  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(page);
  const [loading, setLoading] = useState(true);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchOrders = useCallback(async (pageNum: number = currentPage, isInitial: boolean = false) => {
    // On initial load, show full loading. On subsequent loads (store filter changes), use backgroundLoading
    if (isInitial) {
      setLoading(true);
    } else {
      setBackgroundLoading(true);
    }
    setError(null);

    try {
      const response = await apiClient.listOrders({
        page: pageNum,
        pageSize,
        orderStatus: status,
        dateStart,
        dateEnd,
        clientId: clientId ?? undefined,
      });

      // Enrich orders with additional details
      const enrichedOrders: OrderWithDetails[] = response.orders.map((order) => {
        let shippingAccountName = "—";
        if (order.selectedRate?.providerAccountNickname) {
          shippingAccountName = order.selectedRate.providerAccountNickname;
        } else if (order.bestRate?.carrierNickname) {
          shippingAccountName = order.bestRate.carrierNickname;
        }

        return {
          ...order,
          shippingAccountName,
        };
      });

      setOrders(enrichedOrders);
      setTotal(response.total);
      setPages(response.pages);
      setCurrentPage(pageNum);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to fetch orders");
      setError(error);
      console.error("[useOrdersWithDetails]", error);
    } finally {
      setLoading(false);
      setBackgroundLoading(false);
    }
  }, [status, pageSize, dateStart, dateEnd, clientId, currentPage]);

  useEffect(() => {
    // First load is always initial (full loading spinner)
    const isFirstLoad = orders.length === 0;
    fetchOrders(1, isFirstLoad);
  }, [status, pageSize, dateStart, dateEnd, clientId]);

  const goToPage = useCallback(
    async (pageNum: number) => {
      await fetchOrders(pageNum);
    },
    [fetchOrders]
  );

  return {
    orders,
    total,
    pages,
    currentPage,
    loading,
    backgroundLoading,
    error,
    refetch: () => fetchOrders(currentPage, false),
    goToPage,
  };
}
