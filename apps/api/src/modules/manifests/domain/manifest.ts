export interface ManifestShipmentRecord {
  shipmentId: number;
  orderNumber: string | null;
  trackingNumber: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
  shipmentCost: number | null;
  otherCost: number | null;
  shipDate: string | null;
  weightOz: number | null;
  status: string;
}
