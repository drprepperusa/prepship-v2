import type {
  ListOrdersQuery,
  ListOrdersResponse,
  OrderSummaryDto,
} from "../../../../../../packages/contracts/src/orders/contracts.ts";
import type { OrderRepository } from "./order-repository.ts";
import type { RateServices } from "../../rates/application/rate-services.ts";
import {
  normalizeOrderBestRateDto,
  normalizeOrderSelectedRateDto,
  parseOrderRateJson,
} from "./order-rate-dto.ts";

function parseRawJson(value: string | null): unknown | null {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toOrderDto(
  record: ReturnType<OrderRepository["list"]>["orders"][number],
  rateServices: RateServices | null,
): OrderSummaryDto {
  let rawData = parseRawJson(record.raw) as any;
  
  // Enrich raw data with database-level externallyFulfilled flag
  // This ensures the frontend can check isExternallyFulfilledOrder(order)
  if (record.externallyFulfilledVerified) {
    if (!rawData) {
      // Create minimal raw object if it doesn't exist
      rawData = {};
    }
    rawData.externallyFulfilled = true;
  }
  
  const itemsStr = record.items || "[]";
  let items = [];
  try {
    items = Array.isArray(itemsStr) ? itemsStr : JSON.parse(itemsStr);
  } catch {
    items = [];
  }
  
  const shipTo = (record.shipToName || record.shipToCity || record.shipToState || record.shipToPostalCode)
    ? {
        name: record.shipToName || null,
        city: record.shipToCity || null,
        state: record.shipToState || null,
        postalCode: record.shipToPostalCode || null,
      }
    : null;

  const weight = record.weightValue != null && record.weightValue > 0
    ? { value: record.weightValue, units: "ounces" }
    : null;
  
  // If bestRate is missing from database, try to calculate from cached rates
  let bestRate = normalizeOrderBestRateDto(parseOrderRateJson(record.bestRateJson, `order ${record.orderId} bestRateJson`));
  if (!bestRate && rateServices && weight && record.shipToPostalCode) {
    const cached = rateServices.getCached({
      wt: weight.value,
      zip: record.shipToPostalCode,
      dims: null,
      storeId: record.storeId,
      residential: record.residential ?? false,
    });
    if (cached.cached && cached.best) {
      bestRate = normalizeOrderBestRateDto(cached.best, `order ${record.orderId} cachedBestRate`);
    }
  }
  
  return {
    orderId: record.orderId,
    clientId: record.clientId,
    clientName: record.clientName,
    orderNumber: record.orderNumber,
    orderStatus: record.orderStatus,
    orderDate: record.orderDate,
    storeId: record.storeId,
    customerEmail: record.customerEmail,
    shipTo,
    carrierCode: record.carrierCode,
    serviceCode: record.serviceCode,
    weight,
    orderTotal: record.orderTotal,
    shippingAmount: record.shippingAmount,
    residential: record.residential,
    sourceResidential: record.sourceResidential,
    externalShipped: record.externalShipped,
    bestRate,
    selectedRate: normalizeOrderSelectedRateDto(
      parseOrderRateJson(record.selectedRateJson, `order ${record.orderId} selectedRateJson`),
      {
        providerAccountId: record.labelProvider,
        carrierCode: record.labelCarrier,
        serviceCode: record.labelService,
        shipmentCost: record.labelRawCost,
        otherCost: record.labelCost != null && record.labelRawCost != null
          ? record.labelCost - record.labelRawCost
          : null,
      },
      `order ${record.orderId} selectedRate`,
    ),
    label: {
      shipmentId: record.labelShipmentId,
      trackingNumber: record.labelTracking,
      carrierCode: record.labelCarrier,
      serviceCode: record.labelService,
      shippingProviderId: record.labelProvider,
      cost: record.labelCost,
      rawCost: record.labelRawCost,
      shipDate: record.labelShipDate,
      createdAt: record.labelCreatedAt,
    },
    items,
    raw: rawData,
  };
}

export class ListOrdersService {
  private readonly repository: OrderRepository;
  private readonly rateServices: RateServices | null;

  constructor(repository: OrderRepository, rateServices?: RateServices) {
    this.repository = repository;
    this.rateServices = rateServices ?? null;
  }

  execute(query: ListOrdersQuery): ListOrdersResponse {
    const result = this.repository.list(query);
    const pages = Math.max(1, Math.ceil(result.total / query.pageSize));

    return {
      orders: result.orders.map((record) => toOrderDto(record, this.rateServices)),
      page: query.page,
      pages,
      total: result.total,
    };
  }
}
