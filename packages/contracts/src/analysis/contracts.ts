export interface AnalysisSkuQuery {
  from?: string;
  to?: string;
  clientId?: number;
}

export interface AnalysisSkuDto {
  sku: string;
  name: string;
  clientName: string;
  invSkuId: number | null;
  orders: number;
  qty: number;
  pendingOrders: number;
  externalOrders: number;
  standardOrders: number;
  standardShipCount: number;
  standardAvgShipping: number;
  standardTotalShipping: number;
  expeditedOrders: number;
  expeditedShipCount: number;
  expeditedAvgShipping: number;
  expeditedTotalShipping: number;
  shipCountWithCost: number;
  blendedAvgShipping: number;
  totalShipping: number;
}

export interface AnalysisSkusResponse {
  skus: AnalysisSkuDto[];
  orderCount: number;
}

export interface AnalysisDailySalesQuery {
  from?: string;
  to?: string;
  clientId?: number;
  top: number;
}

export interface TopSkuDto {
  sku: string;
  name: string;
  total: number;
}

export interface AnalysisDailySalesResponse {
  topSkus: TopSkuDto[];
  dates: string[];
  series: Record<string, number[]>;
}

function parseOptionalInt(value: string | null): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseAnalysisSkuQuery(url: URL): AnalysisSkuQuery {
  return {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    clientId: parseOptionalInt(url.searchParams.get("clientId")),
  };
}

export function parseAnalysisDailySalesQuery(url: URL): AnalysisDailySalesQuery {
  const top = parseOptionalInt(url.searchParams.get("top")) ?? 5;
  return {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    clientId: parseOptionalInt(url.searchParams.get("clientId")),
    top: Math.min(Math.max(top, 1), 10),
  };
}
