import { parseGetOrderIdsQuery, parseListOrdersQuery, parseOrderPicklistQuery } from "../../../../../../packages/contracts/src/orders/contracts.ts";
import type { OrderFullService } from "../application/order-full.ts";
import type { OrderDetailsService } from "../application/order-details.ts";
import type { OrderDailyStatsService } from "../application/order-daily-stats.ts";
import type { GetOrderIdsService } from "../application/get-order-ids.ts";
import type { ListOrdersService } from "../application/list-orders.ts";
import type { OrderPicklistService } from "../application/order-picklist.ts";
import type { UpdateOrderOverridesService } from "../application/update-order-overrides.ts";

export class OrdersHttpHandler {
  private readonly listOrdersService: ListOrdersService;
  private readonly orderDetailsService: OrderDetailsService;
  private readonly getOrderIdsService: GetOrderIdsService;
  private readonly orderPicklistService: OrderPicklistService;
  private readonly orderFullService: OrderFullService;
  private readonly updateOrderOverridesService: UpdateOrderOverridesService;
  private readonly orderDailyStatsService: OrderDailyStatsService;

  constructor(
    listOrdersService: ListOrdersService,
    orderDetailsService: OrderDetailsService,
    getOrderIdsService: GetOrderIdsService,
    orderPicklistService: OrderPicklistService,
    orderFullService: OrderFullService,
    updateOrderOverridesService: UpdateOrderOverridesService,
    orderDailyStatsService: OrderDailyStatsService,
  ) {
    this.listOrdersService = listOrdersService;
    this.orderDetailsService = orderDetailsService;
    this.getOrderIdsService = getOrderIdsService;
    this.orderPicklistService = orderPicklistService;
    this.orderFullService = orderFullService;
    this.updateOrderOverridesService = updateOrderOverridesService;
    this.orderDailyStatsService = orderDailyStatsService;
  }

  handleList(requestUrl: URL) {
    const query = parseListOrdersQuery(requestUrl);
    return this.listOrdersService.execute(query);
  }

  handleGetById(orderId: number) {
    return this.orderDetailsService.execute(orderId);
  }

  handleGetIds(requestUrl: URL) {
    const query = parseGetOrderIdsQuery(requestUrl);
    return this.getOrderIdsService.execute(query);
  }

  handlePicklist(requestUrl: URL) {
    const query = parseOrderPicklistQuery(requestUrl);
    return this.orderPicklistService.execute(query);
  }

  handleGetFull(orderId: number) {
    return this.orderFullService.execute(orderId);
  }

  handleDailyStats() {
    return this.orderDailyStatsService.execute();
  }

  handleSetExternalShipped(orderId: number, payload: { flag?: number | boolean }) {
    return this.updateOrderOverridesService.setExternalShipped(orderId, Boolean(payload.flag ?? 1));
  }

  handleSetResidential(orderId: number, payload: { residential?: boolean | null }) {
    return this.updateOrderOverridesService.setResidential(orderId, payload.residential ?? null);
  }

  handleSetSelectedPid(orderId: number, payload: { selectedPid?: number | null }) {
    return this.updateOrderOverridesService.setSelectedPid(orderId, payload.selectedPid ?? null);
  }

  handleSetBestRate(orderId: number, payload: { best?: unknown; dims?: string | null }) {
    return this.updateOrderOverridesService.setBestRate({
      orderId,
      bestRate: payload.best,
      bestRateDims: payload.dims ?? null,
    });
  }
}
