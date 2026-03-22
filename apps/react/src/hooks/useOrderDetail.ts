import { useState, useEffect } from "react";

export interface UseOrderDetailResult {
  order: any;
  isLoading: boolean;
  error: Error | null;
}

export function useOrderDetail(orderId: string): UseOrderDetailResult {
  const [order, setOrder] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!orderId) return;

    setIsLoading(true);
    setError(null);

    // TODO: Replace with actual API call once client is available
    setTimeout(() => {
      setIsLoading(false);
    }, 100);
  }, [orderId]);

  return { order, isLoading, error };
}
