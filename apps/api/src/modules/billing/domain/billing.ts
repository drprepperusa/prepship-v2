export interface BillingClientRecord {
  clientId: number;
  name: string;
}

export interface BillingConfigRecord {
  clientId: number;
  pickPackFee: number | null;
  additionalUnitFee: number | null;
  packageCostMarkup: number | null;
  shippingMarkupPct: number | null;
  shippingMarkupFlat: number | null;
  billing_mode: string | null;
  storageFeePerCuFt: number | null;
  storageFeeMode: string | null;
  palletPricingPerMonth: number | null;
  palletCuFt: number | null;
}

export interface BillingSummaryRecord {
  clientId: number;
  clientName: string;
  pickPackTotal: number;
  additionalTotal: number;
  packageTotal: number;
  shippingTotal: number;
  storageTotal: number;
  orderCount: number;
  grandTotal: number;
}

export interface BillingDetailRecord {
  orderId: number;
  orderNumber: string;
  shipDate: string;
  totalQty: number;
  pickpackTotal: number;
  additionalTotal: number;
  packageTotal: number;
  shippingTotal: number;
  actualLabelCost: number | null;
  label_weight_oz: number | null;
  label_dims_l: number | null;
  label_dims_w: number | null;
  label_dims_h: number | null;
  ref_usps_rate: number | null;
  ref_ups_rate: number | null;
  packageName: string | null;
  itemNames: string | null;
  itemSkus: string | null;
}

export interface BillingPackagePriceRecord {
  packageId: number;
  price: number;
  is_custom: number;
  name: string;
  length: number | null;
  width: number | null;
  height: number | null;
}

export interface BillingStoreClientRecord {
  clientId: number;
  storeIds: string | null;
}

export interface BillingReferenceRateRecord {
  orderId: number;
  ref_usps_rate: number | null;
  ref_ups_rate: number | null;
  rate_dims_l: number | null;
  rate_dims_w: number | null;
  rate_dims_h: number | null;
}

export interface BillingPackageDimensionRecord {
  packageId: number;
  length: number | null;
  width: number | null;
  height: number | null;
}

export interface BillingSkuPackageRecord {
  sku: string | null;
  packageId: number | null;
}

export interface BillingClientPackagePriceRecord {
  clientId: number;
  packageId: number;
  price: number;
}

export interface BillingPackageNameRecord {
  packageId: number;
  name: string;
}

export interface BillingShipmentRecord {
  orderId: number;
  orderNumber: string;
  items: string | null;
  raw: string | null;
  shipDate: string | null;
  billingDate: string;
  shipmentCost: number | null;
  otherCost: number | null;
  carrierCode: string | null;
  dims_l: number | null;
  dims_w: number | null;
  dims_h: number | null;
  external_shipped: number | null;
}

export interface BillingStorageSkuRecord {
  id: number;
  productLength: number | null;
  productWidth: number | null;
  productHeight: number | null;
  cuFtOverride: number | null;
}

export interface BillingLedgerStockTotalRecord {
  total: number;
}

export interface BillingLedgerEventRecord {
  createdAt: number;
  qty: number;
}

export interface BillingInvoiceSummaryRecord {
  pickPackTotal: number;
  additionalTotal: number;
  packageTotal: number;
  shippingTotal: number;
  storageTotal: number;
  orderCount: number;
  grandTotal: number;
}

export interface BillingInvoiceDetailRecord {
  orderId: number;
  orderNumber: string | null;
  shipDate: string | null;
  baseQty: number;
  addlQty: number;
  pickpackAmt: number;
  additionalAmt: number;
  shippingAmt: number;
  storageAmt: number;
  rowTotal: number;
  skus: string | null;
}

export interface BillingInvoiceRecord {
  clientId: number;
  clientName: string;
  from: string;
  to: string;
  summary: BillingInvoiceSummaryRecord;
  details: BillingInvoiceDetailRecord[];
}

export interface BillingFetchReferenceRateOrderRecord {
  orderId: number;
  weightOz: number | null;
  dims_l: number | null;
  dims_w: number | null;
  dims_h: number | null;
  zip5: string | null;
}

export interface BillingBackfillReferenceRateOrderRecord {
  orderId: number;
  orderNumber: string | null;
  weightOz: number | null;
  zip5: string | null;
}
