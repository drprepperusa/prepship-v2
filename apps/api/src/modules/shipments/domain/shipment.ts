export interface ShipmentSyncAccountRecord {
  clientId: number | null;
  accountName: string;
  v1ApiKey: string | null;
  v1ApiSecret: string | null;
  v2ApiKey: string | null;
}

export interface ShipmentSyncRecord {
  shipmentId: number;
  orderId: number;
  orderNumber: string | null;
  shipmentCost: number;
  otherCost: number;
  carrierCode: string | null;
  serviceCode: string | null;
  trackingNumber: string | null;
  shipDate: string | null;
  voided: boolean;
  providerAccountId: number | null;
  createDate: string | null;
  weightOz: number | null;
  dimsLength: number | null;
  dimsWidth: number | null;
  dimsHeight: number | null;
  updatedAt: number;
  clientId: number | null;
  source: string;
}
