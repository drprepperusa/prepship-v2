import type {
  AnalysisDailySalesQuery,
  AnalysisSkuQuery,
} from "../../../../../../packages/contracts/src/analysis/contracts.ts";
import type { AnalysisDailySalesRow, AnalysisOrderRow } from "../domain/analysis.ts";

export interface AnalysisRepository {
  listOrderRows(query: AnalysisSkuQuery): AnalysisOrderRow[];
  listDailySalesRows(query: AnalysisDailySalesQuery, since: string, until: string): AnalysisDailySalesRow[];
  getStoreClientNameMap(): Record<number, string>;
  getInventorySkuMap(): Map<string, number>;
  getClientStoreIds(clientId: number): number[];
}
