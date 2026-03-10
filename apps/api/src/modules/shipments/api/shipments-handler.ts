import type { ShipmentServices } from "../application/shipment-services.ts";

export class ShipmentsHttpHandler {
  private readonly services: ShipmentServices;

  constructor(services: ShipmentServices) {
    this.services = services;
  }

  handleSync() {
    return this.services.triggerSync();
  }

  handleStatus() {
    return this.services.getStatus();
  }

  handleLegacySyncTrigger(full: boolean) {
    return this.services.triggerLegacySync(full);
  }

  handleLegacySyncStatus() {
    return this.services.getLegacyStatus();
  }

  handleList(url: URL) {
    return this.services.list(url.searchParams);
  }
}
