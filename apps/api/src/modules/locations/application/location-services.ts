import type { LocationDto, SaveLocationInput } from "../../../../../../packages/contracts/src/locations/contracts.ts";
import type { LocationRepository } from "./location-repository.ts";
import type { ShipFromState } from "./ship-from-state.ts";
import type { LocationRecord } from "../domain/location.ts";

function mapLocation(record: LocationRecord): LocationDto {
  return {
    locationId: record.locationId,
    name: record.name,
    company: record.company ?? "",
    street1: record.street1 ?? "",
    street2: record.street2 ?? "",
    city: record.city ?? "",
    state: record.state ?? "",
    postalCode: record.postalCode ?? "",
    country: record.country ?? "US",
    phone: record.phone ?? "",
    isDefault: record.isDefault === 1,
    active: record.active === 1,
  };
}

function toShipFrom(record: LocationRecord): Record<string, unknown> {
  return {
    name: record.name,
    company: record.company ?? "",
    street1: record.street1 ?? "",
    street2: record.street2 ?? "",
    city: record.city ?? "",
    state: record.state ?? "",
    postalCode: record.postalCode ?? "",
    country: record.country ?? "US",
    phone: record.phone ?? "",
  };
}

export class LocationServices {
  private readonly repository: LocationRepository;
  private readonly shipFromState: ShipFromState;

  constructor(repository: LocationRepository, shipFromState: ShipFromState) {
    this.repository = repository;
    this.shipFromState = shipFromState;
    this.refreshDefault();
  }

  list(): LocationDto[] {
    return this.repository.list().map(mapLocation);
  }

  create(input: SaveLocationInput) {
    if (!input.name) {
      throw new Error("name is required");
    }
    if (input.isDefault) {
      this.repository.clearDefault();
    }
    const locationId = this.repository.create(input);
    if (input.isDefault) {
      this.refreshDefault();
    }
    return { ok: true, locationId };
  }

  update(locationId: number, input: SaveLocationInput) {
    if (input.isDefault) {
      this.repository.clearDefault();
    }
    this.repository.update(locationId, input);
    this.refreshDefault();
    return { ok: true };
  }

  delete(locationId: number) {
    const defaultBefore = this.repository.getDefault();
    this.repository.delete(locationId);
    if (defaultBefore?.locationId === locationId) {
      this.refreshDefault();
    }
    return { ok: true };
  }

  setDefault(locationId: number) {
    this.repository.clearDefault();
    this.repository.setDefault(locationId);
    this.refreshDefault();
    return {
      ok: true,
      shipFrom: this.shipFromState.current,
    };
  }

  private refreshDefault() {
    const current = this.repository.getDefault();
    this.shipFromState.current = current ? toShipFrom(current) : null;
  }
}

