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
import { assertPersistedOrderBestRateDto } from "../application/order-rate-dto.ts";

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

  async handleList(requestUrl: URL) {
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

  handleStoreCounts(requestUrl: URL) {
    // Get store-level aggregated counts for a given order status, optionally filtered by date
    const orderStatus = requestUrl.searchParams.get("orderStatus") || "shipped";
    const startDate = requestUrl.searchParams.get("startDate") || undefined;
    const endDate = requestUrl.searchParams.get("endDate") || undefined;
    const repo = this.listOrdersService.repository;
    const counts = repo.getStoreCounts(orderStatus, startDate, endDate);
    return counts;
  }

  handleSetExternalShipped(orderId: number, payload: { flag?: number | boolean; source?: string }) {
    const flag = payload.flag;
    const source = payload.source ?? null;
    if (flag == null) {
      return this.updateOrderOverridesService.setExternalShipped(orderId, true, source);
    }
    if (typeof flag === "boolean") {
      return this.updateOrderOverridesService.setExternalShipped(orderId, flag, source);
    }
    if (flag === 0 || flag === 1) {
      return this.updateOrderOverridesService.setExternalShipped(orderId, flag === 1, source);
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
      bestRate: assertPersistedOrderBestRateDto(payload.best, "best"),
      bestRateDims: payload.dims ?? null,
    });
  }

  handleGetDims(orderId: number) {
    // Get dims for the order's primary SKU+QTY combo (from sku_qty_dims)
    const record = this.orderDetailsService.getRecord(orderId);
    if (!record) throw new Error(`Order ${orderId} not found`);
    let parsedItems: Array<{ sku?: string; quantity?: number; adjustment?: boolean }> = [];
    try {
      parsedItems = JSON.parse(record.items) as typeof parsedItems;
    } catch { /* ignore */ }
    const activeItems = parsedItems.filter((i) => !i.adjustment && i.sku);
    const uniqueSkus = [...new Set(activeItems.map((i) => i.sku).filter(Boolean))];
    if (uniqueSkus.length === 1) {
      const sku = uniqueSkus[0] as string;
      const qty = activeItems.filter((i) => i.sku === sku).reduce((s, i) => s + (i.quantity ?? 1), 0);
      const dims = this.updateOrderOverridesService.repository.getSkuQtyDims(sku, qty);
      // Validate dims against order weight: heavy order + tiny box = stale data
      if (dims) {
        const orderWeightOz = record.weightValue ?? 0;
        const cubicInches = dims.length * dims.width * dims.height;
        if (orderWeightOz >= 16 && cubicInches < 1000) {
          return { orderId, sku, qty, dims: null };
        }
      }
      return { orderId, sku, qty, dims };
    }
    return { orderId, sku: null, qty: null, dims: null };
  }

  handleSaveDims(orderId: number, payload: {
    length?: unknown;
    width?: unknown;
    height?: unknown;
    sku?: unknown;
    qty?: unknown;
  }) {
    const length = Number(payload.length ?? 0);
    const width = Number(payload.width ?? 0);
    const height = Number(payload.height ?? 0);
    if (!Number.isFinite(length) || length <= 0) throw new InputValidationError("length must be > 0");
    if (!Number.isFinite(width) || width <= 0) throw new InputValidationError("width must be > 0");
    if (!Number.isFinite(height) || height <= 0) throw new InputValidationError("height must be > 0");
    const sku = payload.sku != null ? String(payload.sku) : null;
    const qty = payload.qty != null ? Math.round(Number(payload.qty)) : null;
    return this.updateOrderOverridesService.saveDims(orderId, sku, qty, length, width, height);
  }
}
