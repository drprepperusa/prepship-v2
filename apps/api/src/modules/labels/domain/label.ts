export interface AddressRecord {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
}

export interface LabelOrderRecord {
  orderId: number;
  orderNumber: string | null;
  orderStatus: string;
  storeId: number | null;
  clientId: number | null;
  weightValue: number | null;
  shipToName: string | null;
  raw: string;
}

export interface ExistingLabelRecord {
  shipmentId: number;
  trackingNumber: string | null;
  labelUrl: string | null;
}

export interface ResolvedPackageDimensions {
  packageId: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
}

export interface ShippingAccountContext {
  clientId: number | null;
  storeId: number | null;
  v1ApiKey: string | null;
  v1ApiSecret: string | null;
  v2ApiKey: string | null;
  rateSourceClientId: number | null;
}

export interface LabelShipmentRecord {
  shipmentId: number;
  orderId: number;
  orderNumber: string | null;
  trackingNumber: string | null;
  labelUrl: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
  shipmentCost: number | null;
  labelCreatedAt: number | null;
  voided: boolean;
  source: string | null;
  storeId: number | null;
}

export interface PersistedShipmentInput {
  shipmentId: number;
  orderId: number;
  orderNumber: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
  trackingNumber: string | null;
  shipDate: string | null;
  labelUrl: string | null;
  shipmentCost: number;
  otherCost: number;
  voided: boolean;
  updatedAt: number;
  weightOz: number | null;
  dimsLength: number | null;
  dimsWidth: number | null;
  dimsHeight: number | null;
  createDate: string | null;
  clientId: number;
  providerAccountId: number | null;
  source: string;
  labelCreatedAt: number | null;
  labelFormat: string | null;
  selectedRateJson: string | null;
}

export interface ReturnLabelRecord {
  shipmentId: number;
  returnShipmentId: number | null;
  returnTrackingNumber: string;
  reason: string;
  createdAt: number;
}

export interface ShipmentEnrichmentInput {
  shipmentId: number;
  otherCost: number;
  createDate: string | null;
  weightOz: number | null;
  dimsLength: number | null;
  dimsWidth: number | null;
  dimsHeight: number | null;
  updatedAt: number;
}
