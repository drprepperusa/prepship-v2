import type {
  AdjustInventoryInput,
  BulkUpdateInventoryDimensionsInput,
  ListInventoryLedgerQuery,
  ListInventoryQuery,
  ParentSkuDetailDto,
  ParentSkuDto,
  ReceiveInventoryInput,
  ReceiveInventoryResultDto,
  SaveParentSkuInput,
  SetInventoryParentInput,
  UpdateInventoryItemInput,
} from "../../../../../../packages/contracts/src/inventory/contracts.ts";
import type { InventoryAlertRecord, InventoryRecord } from "../domain/inventory.ts";

export interface InventoryRepository {
  list(query: ListInventoryQuery): InventoryRecord[];
  receive(input: ReceiveInventoryInput): ReceiveInventoryResultDto[];
  adjust(input: AdjustInventoryInput): number;
  update(inventoryId: number, input: UpdateInventoryItemInput): void;
  listLedger(query: ListInventoryLedgerQuery): Record<string, unknown>[];
  getLedgerByInventoryId(inventoryId: number): Record<string, unknown>[];
  listAlerts(clientId: number): InventoryAlertRecord[];
  populate(): { ok: true; skusRegistered: number; shippedProcessed: number };
  importProductDimensions(clientId?: number, overwrite?: boolean): { ok: true; updated: number; skipped: number; noMatch: number; total: number };
  bulkUpdateDimensions(input: BulkUpdateInventoryDimensionsInput): { ok: true; updated: number };
  listParentSkus(clientId: number): ParentSkuDto[];
  getParentSku(parentSkuId: number): ParentSkuDetailDto | null;
  createParentSku(input: SaveParentSkuInput): { ok: true; parentSkuId: number; sku?: string; baseUnitQty: number };
  setParent(inventoryId: number, input: SetInventoryParentInput): { ok: true };
  deleteParent(parentSkuId: number): { ok: true };
  getSkuOrders(inventoryId: number, days?: number): Record<string, unknown> | null;
}
