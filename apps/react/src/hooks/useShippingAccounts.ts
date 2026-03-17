import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/client";
import type { CarrierAccountDto } from "@prepshipv2/contracts/init/contracts";

export interface UseShippingAccountsResult {
  accounts: CarrierAccountDto[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useShippingAccounts(): UseShippingAccountsResult {
  const [accounts, setAccounts] = useState<CarrierAccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await apiClient.getCarriers();
      setAccounts(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to fetch shipping accounts");
      setError(error);
      console.error("[useShippingAccounts]", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  return {
    accounts,
    loading,
    error,
    refetch: fetchAccounts,
  };
}
