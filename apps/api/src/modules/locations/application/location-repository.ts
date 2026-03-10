import type { SaveLocationInput } from "../../../../../../packages/contracts/src/locations/contracts.ts";
import type { LocationRecord } from "../domain/location.ts";

export interface LocationRepository {
  list(): LocationRecord[];
  getDefault(): LocationRecord | null;
  create(input: SaveLocationInput): number;
  update(locationId: number, input: SaveLocationInput): void;
  delete(locationId: number): void;
  clearDefault(): void;
  setDefault(locationId: number): void;
}

