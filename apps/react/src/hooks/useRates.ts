import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/client";
import type { RateDto, RateDimsDto } from "@prepshipv2/contracts/rates/contracts";

export interface UseRatesOptions {
  weightOz?: number;
  dims?: RateDimsDto | null;
  residential?: boolean;
  storeId?: number | null;
}

export interface UseRatesResult {
  rates: RateDto[];
  bestRate: RateDto | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useRates(origin: string | undefined, destination: string | undefined, options: UseRatesOptions = {}): UseRatesResult {
  const { weightOz = 0, dims = null, residential = false, storeId = null } = options;

  const [rates, setRates] = useState<RateDto[]>([]);
  const [bestRate, setBestRate] = useState<RateDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchRates = useCallback(async () => {
    // Don't fetch if we don't have destination
    if (!destination) {
      setRates([]);
      setBestRate(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Try cached rates first
      const cached = await apiClient.getCachedRates({
        wt: weightOz,
        zip: destination,
        dims,
        residential,
        storeId,
      });

      setRates(cached.rates);
      setBestRate(cached.best);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to fetch rates");
      setError(error);
      console.error("[useRates]", error);
    } finally {
      setLoading(false);
    }
  }, [destination, weightOz, dims, residential, storeId]);

  useEffect(() => {
    fetchRates();
  }, [destination, weightOz, dims, residential, storeId, fetchRates]);

  return {
    rates,
    bestRate,
    loading,
    error,
    refetch: fetchRates,
  };
}
