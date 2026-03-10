import type {
  AdjustInventoryInput,
  BulkUpdateInventoryDimensionsInput,
  ReceiveInventoryInput,
  SaveParentSkuInput,
  SetInventoryParentInput,
  UpdateInventoryItemInput,
} from "../../../../../../packages/contracts/src/inventory/contracts.ts";
import { parseListInventoryLedgerQuery, parseListInventoryQuery } from "../../../../../../packages/contracts/src/inventory/contracts.ts";
import type { InventoryServices } from "../application/inventory-services.ts";

export class InventoryHttpHandler {
  private readonly services: InventoryServices;

  constructor(services: InventoryServices) {
    this.services = services;
  }

  handleList(url: URL) {
    return this.services.list(parseListInventoryQuery(url));
  }

  handleReceive(body: ReceiveInventoryInput) {
    return this.services.receive(body);
  }

  handleAdjust(body: AdjustInventoryInput) {
    return this.services.adjust(body);
  }

  handleUpdate(inventoryId: number, body: UpdateInventoryItemInput) {
    return this.services.update(inventoryId, body);
  }

  handleLedger(url: URL) {
    return this.services.listLedger(parseListInventoryLedgerQuery(url));
  }

  handleInventoryLedger(inventoryId: number) {
    return this.services.getLedger(inventoryId);
  }

  handleAlerts(clientId: number) {
    return this.services.listAlerts(clientId);
  }

  handlePopulate() {
    return this.services.populate();
  }

  handleImportDimensions(url: URL) {
    const rawClientId = url.searchParams.get("clientId");
    const clientId = rawClientId ? Number.parseInt(rawClientId, 10) : undefined;
    return this.services.importProductDimensions(clientId, url.searchParams.get("overwrite") === "1");
  }

  handleBulkUpdateDimensions(body: BulkUpdateInventoryDimensionsInput) {
    return this.services.bulkUpdateDimensions(body);
  }

  handleListParentSkus(url: URL) {
    const rawId = url.searchParams.get("id");
    if (rawId) {
      return this.services.getParentSku(Number.parseInt(rawId, 10));
    }
    const rawClientId = url.searchParams.get("clientId");
    return this.services.listParentSkus(Number.parseInt(rawClientId ?? "0", 10));
  }

  handleCreateParentSku(body: SaveParentSkuInput) {
    return this.services.createParentSku(body);
  }

  handleSetParent(inventoryId: number, body: SetInventoryParentInput) {
    return this.services.setParent(inventoryId, body);
  }

  handleDeleteParent(parentSkuId: number) {
    return this.services.deleteParent(parentSkuId);
  }

  handleSkuOrders(inventoryId: number, url: URL) {
    const rawDays = url.searchParams.get("days");
    const days = rawDays ? Number.parseInt(rawDays, 10) : undefined;
    return this.services.getSkuOrders(inventoryId, days);
  }
}
