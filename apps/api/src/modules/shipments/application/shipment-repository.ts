import type { ShipmentSyncAccountRecord, ShipmentSyncRecord } from "../domain/shipment.ts";

export interface ExternalShipmentRecord {
  orderId: number;
  trackingNumber: string;
  carrier: string;
  estimatedDelivery: string | null;
  clientId: number | null;
  source: string;
}

export interface ShipmentRepository {
  countActiveShipments(): number;
  getLastShipmentSync(): number | null;
  setLastShipmentSync(timestamp: number): void;
  listSyncAccounts(): ShipmentSyncAccountRecord[];
  resolveOrderIdByOrderNumber(orderNumber: string): number | null;
  orderExists(orderId: number): boolean;
  getOrderClientId(orderId: number): number | null;
  upsertShipmentBatch(shipments: ShipmentSyncRecord[]): void;
  backfillOrderLocalFromShipments(shipments: ShipmentSyncRecord[]): void;
  storeExists(storeId: number): boolean;
  getOrderNumbersByStoreId(storeId: number): string[];
  recordExternalShipment(shipment: ExternalShipmentRecord): void;
}
