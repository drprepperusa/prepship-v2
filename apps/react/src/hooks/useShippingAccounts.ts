import { useState, useEffect } from "react";

export interface UseShippingAccountsResult {
  accounts: any[];
  isLoading: boolean;
  error: Error | null;
}

export function useShippingAccounts(): UseShippingAccountsResult {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    // TODO: Replace with actual API call once client is available
    setTimeout(() => {
      setAccounts([]);
      setIsLoading(false);
    }, 100);
  }, []);

  return { accounts, isLoading, error };
}
