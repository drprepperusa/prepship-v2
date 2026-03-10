export interface ShipFromState {
  current: Record<string, unknown> | null;
}

export class InMemoryShipFromState implements ShipFromState {
  current: Record<string, unknown> | null = null;
}

