/**
 * API Types - Re-exports and row interfaces for PrepShip V2
 * Combines contract DTOs with table-specific row types
 */

// ============================================================================
// ORDERS
// ============================================================================

export interface OrderSummaryDto {
  orderId: number;
  clientId: number | null;
  clientName: string | null;
  orderNumber: string | null;
  orderStatus: string;
  orderDate: string | null;
  storeId: number | null;
  customerEmail: string | null;
  shipTo: {
    name: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
  } | null;
  carrierCode: string | null;
  serviceCode: string | null;
  weight: {
    value: number;
    units: string;
  } | null;
  orderTotal: number | null;
  shippingAmount: number | null;
  residential: boolean | null;
  sourceResidential: boolean | null;
  externalShipped: boolean;
  bestRate: OrderBestRateDto | null;
  selectedRate: OrderSelectedRateDto | null;
  label: {
    shipmentId: number | null;
    trackingNumber: string | null;
    carrierCode: string | null;
    serviceCode: string | null;
    shippingProviderId: number | null;
    cost: number | null;
    rawCost: number | null;
    shipDate: string | null;
  };
  items: unknown[];
  raw: unknown;
  rateDims: { length: number; width: number; height: number } | null;
}

export interface OrderBestRateDto {
  serviceCode: string | null;
  serviceName: string | null;
  carrierCode: string | null;
  [key: string]: unknown;
}

export interface OrderSelectedRateDto {
  providerAccountId: number | null;
  providerAccountNickname: string | null;
  shippingProviderId: number | null;
  carrierCode: string | null;
  serviceCode: string | null;
  serviceName: string | null;
  cost: number | null;
  shipmentCost: number | null;
  otherCost: number | null;
}

/** Row type for Orders table */
export type OrderRow = OrderSummaryDto;

export interface ListOrdersQuery {
  page: number;
  pageSize: number;
  orderStatus?: string;
  storeId?: number;
  clientId?: number;
  dateStart?: string;
  dateEnd?: string;
}

export interface ListOrdersResponse {
  orders: OrderSummaryDto[];
  page: number;
  pages: number;
  total: number;
}

// ============================================================================
// CLIENTS
// ============================================================================

export interface ClientDto {
  clientId: number;
  name: string;
  storeIds: number[];
  contactName: string;
  email: string;
  phone: string;
  active: boolean;
  hasOwnAccount: boolean;
  rateSourceClientId: number | null;
  rateSourceName: string;
}

/** Row type for Clients table */
export type ClientRow = ClientDto;

export interface CreateClientInput {
  name: string;
  storeIds?: number[];
  contactName?: string;
  email?: string;
  phone?: string;
}

export interface UpdateClientInput {
  name: string;
  storeIds?: number[];
  contactName?: string;
  email?: string;
  phone?: string;
  ss_api_key?: string | null;
  ss_api_secret?: string | null;
  ss_api_key_v2?: string | null;
  rate_source_client_id?: number | null;
}

// ============================================================================
// INVENTORY
// ============================================================================

export interface InventoryItemDto {
  id: number;
  clientId: number;
  sku: string;
  name: string;
  minStock: number;
  active: boolean;
  weightOz: number;
  parentSkuId: number | null;
  baseUnitQty: number;
  packageLength: number;
  packageWidth: number;
  packageHeight: number;
  productLength: number;
  productWidth: number;
  productHeight: number;
  packageId: number | null;
  units_per_pack: number;
  cuFtOverride: number | null;
  clientName: string;
  packageName: string | null;
  packageDimLength: number | null;
  packageDimWidth: number | null;
  packageDimHeight: number | null;
  parentName: string | null;
  currentStock: number;
  lastMovement: number | null;
  imageUrl: string | null;
  baseUnits: number;
  status: "ok" | "low" | "out";
}

/** Row type for Inventory table */
export type InventoryRow = InventoryItemDto;

export interface InventoryLedgerEntryDto {
  id: number;
  invSkuId: number;
  type: string;
  qty: number;
  orderId: number | null;
  note: string | null;
  createdBy: string | null;
  createdAt: number;
  sku: string;
  skuName: string;
  clientId: number;
  clientName: string;
}

/** Row type for Inventory Ledger */
export type InventoryLedgerRow = InventoryLedgerEntryDto;

export interface InventoryAlertDto {
  type: "sku" | "parent";
  id: number;
  sku?: string;
  name: string;
  stock: number;
  minStock: number;
  parentSkuId: number | null;
  status: "out" | "low";
}

export interface ParentSkuDto {
  parentSkuId: number;
  clientId: number;
  name: string;
  sku?: string | null;
  baseUnitQty?: number;
  childCount?: number;
  totalBaseUnits?: number;
  createdAt?: number | null;
  updatedAt?: number | null;
}

export interface ParentSkuDetailDto extends ParentSkuDto {
  children: Array<{
    id: number;
    sku: string;
    name: string;
    minStock: number;
    active: boolean;
    baseUnitQty: number;
    baseUnits: number;
  }>;
  lowStockCount: number;
  lowStockChildren: Array<{
    id: number;
    sku: string;
    name: string;
    minStock: number;
    active: boolean;
    baseUnitQty: number;
    baseUnits: number;
  }>;
}

export interface ReceiveInventoryInput {
  clientId: number;
  items: Array<{
    sku: string;
    name?: string;
    qty: number;
  }>;
  note?: string;
  receivedAt?: string | number;
}

export interface ReceiveInventoryResultDto {
  sku: string;
  qty: number;
  baseUnitQty: number;
  baseUnits: number;
  invSkuId: number;
  newStock: number;
}

export interface AdjustInventoryInput {
  invSkuId: number;
  qty: number;
  note?: string;
  type?: string;
  adjustedAt?: string | number;
}

export interface UpdateInventoryItemInput {
  name?: string;
  minStock?: number;
  weightOz?: number;
  length?: number;
  width?: number;
  height?: number;
  productLength?: number;
  productWidth?: number;
  productHeight?: number;
  packageId?: number | null;
  units_per_pack?: number;
  cuFtOverride?: number | null;
}

export interface ListInventoryQuery {
  clientId?: number;
  sku?: string;
}

export interface ListInventoryLedgerQuery {
  clientId?: number;
  type?: string;
  dateStart?: number;
  dateEnd?: number;
  limit: number;
}

// ============================================================================
// LOCATIONS
// ============================================================================

export interface LocationDto {
  locationId: number;
  name: string;
  company: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
  active: boolean;
}

/** Row type for Locations table */
export type LocationRow = LocationDto;

export interface SaveLocationInput {
  name: string;
  company?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  isDefault?: boolean;
}

// ============================================================================
// SHIPMENTS
// ============================================================================

export interface ShipmentSyncStatusDto {
  count: number;
  lastSync: number | null;
  running: boolean;
}

export interface LegacySyncStatusDto {
  status: "idle" | "syncing" | "done" | "error";
  lastSync: number | null;
  count: number;
  error: string | null;
  page: number;
  mode: "idle" | "incremental" | "full";
  ratesCached: number;
  ratePrefetchRunning: boolean;
}

// ============================================================================
// PRODUCTS
// ============================================================================

export interface ProductDefaultsDto {
  sku: string;
  weightOz: number;
  length: number;
  width: number;
  height: number;
  defaultPackageCode?: string | null;
  _localOnly?: boolean;
}

/** Row type for Products table */
export type ProductRow = ProductDefaultsDto;

export interface SaveProductDefaultsInput {
  productId?: number;
  sku?: string;
  weightOz?: number;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  packageCode?: string | null;
  packageId?: number | string | null;
}

export interface SaveProductDefaultsResult {
  ok: true;
  localOnly?: boolean;
  productId?: number;
  sku?: string;
  saved?: Record<string, unknown>;
  resolvedPackageId?: number | null;
  newPackageCreated?: boolean;
  packageData?: {
    packageId: number;
    name: string;
    length: number | null;
    width: number | null;
    height: number | null;
    source: string | null;
  } | null;
}

// ============================================================================
// PAGINATION
// ============================================================================

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

// ============================================================================
// COMMON TYPES
// ============================================================================

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface FilterState {
  [key: string]: unknown;
}

export interface AsyncState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}
