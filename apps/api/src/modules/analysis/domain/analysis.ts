export interface AnalysisOrderRow {
  items: string | null;
  serviceCode: string | null;
  storeId: number | null;
  orderStatus: string;
  labelCost: number | null;
  isExternal: number;
}

export interface AnalysisDailySalesRow {
  day: string;
  sku: string;
  name: string | null;
  qty: number;
}
