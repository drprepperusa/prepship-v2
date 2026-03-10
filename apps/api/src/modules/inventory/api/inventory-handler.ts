import type {
  AdjustInventoryInput,
  BulkUpdateInventoryDimensionsInput,
  ReceiveInventoryInput,
  SaveParentSkuInput,
  SetInventoryParentInput,
  UpdateInventoryItemInput,
} from "../../../../../../packages/contracts/src/inventory/contracts.ts";
import { InputValidationError, parseOptionalIntegerParam } from "../../../../../../packages/contracts/src/common/input-validation.ts";
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
    const clientId = parseOptionalIntegerParam(url.searchParams.get("clientId"), "clientId");
    return this.services.importProductDimensions(clientId, url.searchParams.get("overwrite") === "1");
  }

  handleBulkUpdateDimensions(body: BulkUpdateInventoryDimensionsInput) {
    return this.services.bulkUpdateDimensions(body);
  }

  handleListParentSkus(url: URL) {
    const rawId = url.searchParams.get("id");
    if (rawId) {
      const parentSkuId = parseOptionalIntegerParam(rawId, "id");
      if (parentSkuId == null) {
        throw new InputValidationError("id required");
      }
      return this.services.getParentSku(parentSkuId);
    }
    const clientId = parseOptionalIntegerParam(url.searchParams.get("clientId"), "clientId");
    return this.services.listParentSkus(clientId ?? 0);
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
    const days = parseOptionalIntegerParam(url.searchParams.get("days"), "days");
    return this.services.getSkuOrders(inventoryId, days);
  }
}
