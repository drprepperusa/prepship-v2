import { type PageMeta } from "../common/pagination.ts";
import { parseOptionalIntegerParam } from "../common/input-validation.ts";

export interface ListOrdersQuery {
  page: number;
  pageSize: number;
  orderStatus?: string;
  storeId?: number;
  dateStart?: string;
  dateEnd?: string;
}

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
  bestRate: unknown | null;
  selectedRate: unknown | null;
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
}

export interface ListOrdersResponse {
  orders: OrderSummaryDto[];
  page: number;
  pages: number;
  total: number;
}

export interface GetOrderIdsQuery {
  sku: string;
  qty?: number;
  orderStatus?: string;
  storeId?: number;
}

export interface GetOrderIdsResponse {
  ids: number[];
}

export interface OrderPicklistItemDto {
  storeId: number | null;
  clientName: string;
  sku: string;
  name: string | null;
  imageUrl: string | null;
  totalQty: number;
  orderCount: number;
}

export interface GetOrderPicklistQuery {
  orderStatus?: string;
  storeId?: number;
  dateStart?: string;
  dateEnd?: string;
}

export interface GetOrderPicklistResponse {
  skus: OrderPicklistItemDto[];
  orderStatus?: string;
}

export interface OrderOverrideInput {
  orderId: number;
  externalShipped?: boolean;
  residential?: boolean | null;
  selectedPid?: number | null;
  bestRate?: unknown;
  bestRateDims?: string | null;
}

export interface OrderFullDto {
  raw: unknown;
  shipments: unknown[];
  local: Record<string, unknown> | null;
}

export interface OrdersDailyStatsDto {
  window: {
    from: string;
    to: string;
    fromLabel: string;
    toLabel: string;
  };
  totalOrders: number;
  needToShip: number;
  upcomingOrders: number;
}

export function parseListOrdersQuery(url: URL): ListOrdersQuery {
  const page = Math.max(1, parseOptionalIntegerParam(url.searchParams.get("page"), "page") ?? 1);
  const pageSize = Math.min(500, Math.max(1, parseOptionalIntegerParam(url.searchParams.get("pageSize"), "pageSize") ?? 50));

  return {
    page,
    pageSize,
    orderStatus: url.searchParams.get("orderStatus") ?? undefined,
    storeId: parseOptionalIntegerParam(url.searchParams.get("storeId"), "storeId"),
    dateStart: url.searchParams.get("dateStart") ?? undefined,
    dateEnd: url.searchParams.get("dateEnd") ?? undefined,
  };
}

export function parseGetOrderIdsQuery(url: URL): GetOrderIdsQuery {
  const sku = url.searchParams.get("sku");

  if (!sku) {
    throw new Error("sku required");
  }

  return {
    sku,
    qty: parseOptionalIntegerParam(url.searchParams.get("qty"), "qty"),
    orderStatus: url.searchParams.get("orderStatus") ?? undefined,
    storeId: parseOptionalIntegerParam(url.searchParams.get("storeId"), "storeId"),
  };
}

export function parseOrderPicklistQuery(url: URL): GetOrderPicklistQuery {
  return {
    orderStatus: url.searchParams.get("orderStatus") ?? undefined,
    storeId: parseOptionalIntegerParam(url.searchParams.get("storeId"), "storeId"),
    dateStart: url.searchParams.get("dateStart") ?? undefined,
    dateEnd: url.searchParams.get("dateEnd") ?? undefined,
  };
}
