import type {
  ExistingLabelRecord,
  LabelOrderRecord,
  LabelShipmentRecord,
  PersistedShipmentInput,
  ResolvedPackageDimensions,
  ReturnLabelRecord,
  ShipmentEnrichmentInput,
  ShippingAccountContext,
} from "../domain/label.ts";

export interface LabelRepository {
  getOrder(orderId: number): LabelOrderRecord | null;
  findActiveLabelForOrder(orderId: number): ExistingLabelRecord | null;
  resolvePackageDimensions(orderId: number): ResolvedPackageDimensions | null;
  getShippingAccountContext(storeId: number | null): ShippingAccountContext;
  saveShipment(input: PersistedShipmentInput): void;
  markOrderShipped(orderId: number, updatedAt: number): void;
  markShipmentVoided(shipmentId: number, orderId: number, updatedAt: number): void;
  saveReturnLabel(record: ReturnLabelRecord): void;
  getShipmentForVoidOrReturn(shipmentId: number): LabelShipmentRecord | null;
  getLatestShipmentForOrderLookup(orderLookup: number | string): LabelShipmentRecord | null;
  updateShipmentLabelUrl(shipmentId: number, labelUrl: string): void;
  backfillOrderLocalTracking(orderId: number, trackingNumber: string, providerAccountId: number | null, updatedAtSeconds: number): void;
  enrichShipment(input: ShipmentEnrichmentInput): void;
}
