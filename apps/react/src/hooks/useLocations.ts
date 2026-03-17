import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/client";
import type { LocationDto, SaveLocationInput } from "@prepshipv2/contracts/locations/contracts";

export interface UseLocationsResult {
  locations: LocationDto[];
  loading: boolean;
  error: Error | null;
  addLocation: (input: SaveLocationInput) => Promise<LocationDto>;
  updateLocation: (locationId: number, input: SaveLocationInput) => Promise<LocationDto>;
  deleteLocation: (locationId: number) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useLocations(): UseLocationsResult {
  const [locations, setLocations] = useState<LocationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await apiClient.listLocations();
      setLocations(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to fetch locations");
      setError(error);
      console.error("[useLocations]", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const addLocation = useCallback(
    async (input: SaveLocationInput): Promise<LocationDto> => {
      try {
        const newLocation = await apiClient.createLocation(input);
        setLocations((prev) => [...prev, newLocation]);
        return newLocation;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to create location");
        console.error("[useLocations.addLocation]", error);
        throw error;
      }
    },
    []
  );

  const updateLocationFn = useCallback(
    async (locationId: number, input: SaveLocationInput): Promise<LocationDto> => {
      try {
        const updated = await apiClient.updateLocation(locationId, input);
        setLocations((prev) => prev.map((loc) => (loc.locationId === locationId ? updated : loc)));
        return updated;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to update location");
        console.error("[useLocations.updateLocation]", error);
        throw error;
      }
    },
    []
  );

  const deleteLocationFn = useCallback(
    async (locationId: number): Promise<void> => {
      try {
        await apiClient.deleteLocation(locationId);
        setLocations((prev) => prev.filter((loc) => loc.locationId !== locationId));
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to delete location");
        console.error("[useLocations.deleteLocation]", error);
        throw error;
      }
    },
    []
  );

  return {
    locations,
    loading,
    error,
    addLocation,
    updateLocation: updateLocationFn,
    deleteLocation: deleteLocationFn,
    refetch: fetchLocations,
  };
}
