import type {
  GetOrderIdsQuery,
  GetOrderPicklistQuery,
  OrderExportQuery,
  OrderExportRow,
  OrderFullDto,
  OrdersDailyStatsDto,
  OrderPicklistItemDto,
  ListOrdersQuery,
} from "../../../../../../packages/contracts/src/orders/contracts.ts";
import type { OrderRecord } from "../domain/order.ts";

export interface OrderListResult {
  orders: OrderRecord[];
  total: number;
}

export interface OrderRepository {
  list(query: ListOrdersQuery): OrderListResult;
  getById(orderId: number): OrderRecord | null;
  findIdsBySku(query: GetOrderIdsQuery): number[];
  getPicklist(query: GetOrderPicklistQuery): OrderPicklistItemDto[];
  getFullById(orderId: number): OrderFullDto | null;
  updateExternalShipped(orderId: number, externalShipped: boolean): void;
  updateResidential(orderId: number, residential: boolean | null): void;
  updateSelectedPid(orderId: number, selectedPid: number | null): void;
  updateBestRate(orderId: number, bestRate: unknown, bestRateDims: string | null): void;
  getDailyStats(): OrdersDailyStatsDto;
  exportOrders(query: OrderExportQuery): OrderExportRow[];
}
