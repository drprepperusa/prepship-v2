import { type PageMeta } from "../common/pagination.ts";

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
  orderNumber: string | null;
  orderStatus: string;
  orderDate: string | null;
  storeId: number | null;
  customerEmail: string | null;
  shipToName: string | null;
  shipToPostalCode: string | null;
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
  raw: unknown;
}

export interface ListOrdersResponse {
  orders: OrderSummaryDto[];
  meta: PageMeta;
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

function parseOptionalInt(value: string | null): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseListOrdersQuery(url: URL): ListOrdersQuery {
  const page = Math.max(1, parseOptionalInt(url.searchParams.get("page")) ?? 1);
  const pageSize = Math.min(500, Math.max(1, parseOptionalInt(url.searchParams.get("pageSize")) ?? 50));

  return {
    page,
    pageSize,
    orderStatus: url.searchParams.get("orderStatus") ?? undefined,
    storeId: parseOptionalInt(url.searchParams.get("storeId")),
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
    qty: parseOptionalInt(url.searchParams.get("qty")),
    orderStatus: url.searchParams.get("orderStatus") ?? undefined,
    storeId: parseOptionalInt(url.searchParams.get("storeId")),
  };
}

export function parseOrderPicklistQuery(url: URL): GetOrderPicklistQuery {
  return {
    orderStatus: url.searchParams.get("orderStatus") ?? undefined,
    storeId: parseOptionalInt(url.searchParams.get("storeId")),
    dateStart: url.searchParams.get("dateStart") ?? undefined,
    dateEnd: url.searchParams.get("dateEnd") ?? undefined,
  };
}
