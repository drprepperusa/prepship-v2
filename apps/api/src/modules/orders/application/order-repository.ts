import type {
  GetOrderIdsQuery,
  GetOrderPicklistQuery,
  OrderBestRateDto,
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
  updateBestRate(orderId: number, bestRate: OrderBestRateDto, bestRateDims: string | null): void;
  updateOrderRateDims(orderId: number, length: number, width: number, height: number): void;
  getSkuQtyDims(sku: string, qty: number): { length: number; width: number; height: number } | null;
  saveSkuQtyDims(sku: string, qty: number, length: number, width: number, height: number): void;
  getDailyStats(): OrdersDailyStatsDto;
  exportOrders(query: OrderExportQuery): OrderExportRow[];
}
