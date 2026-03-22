import { useState, useEffect } from "react";

export interface UseLocationsResult {
  locations: any[];
  isLoading: boolean;
  error: Error | null;
}

export function useLocations(): UseLocationsResult {
  const [locations, setLocations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    // TODO: Replace with actual API call once client is available
    setTimeout(() => {
      setLocations([]);
      setIsLoading(false);
    }, 100);
  }, []);

  return { locations, isLoading, error };
}
