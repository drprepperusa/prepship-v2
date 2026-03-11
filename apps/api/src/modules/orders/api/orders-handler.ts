import { parseGetOrderIdsQuery, parseListOrdersQuery, parseOrderExportQuery, parseOrderPicklistQuery } from "../../../../../../packages/contracts/src/orders/contracts.ts";
import { InputValidationError } from "../../../../../../packages/contracts/src/common/input-validation.ts";
import type { OrderFullService } from "../application/order-full.ts";
import type { OrderDetailsService } from "../application/order-details.ts";
import type { OrderDailyStatsService } from "../application/order-daily-stats.ts";
import type { OrderExportService } from "../application/order-export.ts";
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
  private readonly orderExportService: OrderExportService;

  constructor(
    listOrdersService: ListOrdersService,
    orderDetailsService: OrderDetailsService,
    getOrderIdsService: GetOrderIdsService,
    orderPicklistService: OrderPicklistService,
    orderFullService: OrderFullService,
    updateOrderOverridesService: UpdateOrderOverridesService,
    orderDailyStatsService: OrderDailyStatsService,
    orderExportService: OrderExportService,
  ) {
    this.listOrdersService = listOrdersService;
    this.orderDetailsService = orderDetailsService;
    this.getOrderIdsService = getOrderIdsService;
    this.orderPicklistService = orderPicklistService;
    this.orderFullService = orderFullService;
    this.updateOrderOverridesService = updateOrderOverridesService;
    this.orderDailyStatsService = orderDailyStatsService;
    this.orderExportService = orderExportService;
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

  handleExport(requestUrl: URL) {
    const query = parseOrderExportQuery(requestUrl);
    return this.orderExportService.execute(query);
  }

  handleSetExternalShipped(orderId: number, payload: { flag?: number | boolean }) {
    const flag = payload.flag;
    if (flag == null) {
      return this.updateOrderOverridesService.setExternalShipped(orderId, true);
    }
    if (typeof flag === "boolean") {
      return this.updateOrderOverridesService.setExternalShipped(orderId, flag);
    }
    if (flag === 0 || flag === 1) {
      return this.updateOrderOverridesService.setExternalShipped(orderId, flag === 1);
    }
    throw new InputValidationError("flag must be boolean or 0/1");
  }

  handleSetResidential(orderId: number, payload: { residential?: boolean | null }) {
    if (!("residential" in payload) || payload.residential === undefined) {
      return this.updateOrderOverridesService.setResidential(orderId, null);
    }
    if (payload.residential !== null && typeof payload.residential !== "boolean") {
      throw new InputValidationError("residential must be boolean or null");
    }
    return this.updateOrderOverridesService.setResidential(orderId, payload.residential ?? null);
  }

  handleSetSelectedPid(orderId: number, payload: { selectedPid?: number | null }) {
    if (!("selectedPid" in payload) || payload.selectedPid === undefined) {
      return this.updateOrderOverridesService.setSelectedPid(orderId, null);
    }
    if (payload.selectedPid !== null || payload.selectedPid === 0) {
      if (!Number.isSafeInteger(payload.selectedPid as number)) {
        throw new InputValidationError("selectedPid must be an integer or null");
      }
    }
    return this.updateOrderOverridesService.setSelectedPid(orderId, payload.selectedPid ?? null);
  }

  handleSetBestRate(orderId: number, payload: { best?: unknown; dims?: string | null }) {
    if (payload.dims !== undefined && payload.dims !== null && typeof payload.dims !== "string") {
      throw new InputValidationError("dims must be a string or null");
    }
    return this.updateOrderOverridesService.setBestRate({
      orderId,
      bestRate: payload.best,
      bestRateDims: payload.dims ?? null,
    });
  }
}
