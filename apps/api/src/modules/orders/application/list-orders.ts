import type {
  ListOrdersQuery,
  ListOrdersResponse,
  OrderSummaryDto,
} from "../../../../../../packages/contracts/src/orders/contracts.ts";
import type { OrderRepository } from "./order-repository.ts";

function parseJson(value: string | null): unknown | null {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toOrderDto(record: ReturnType<OrderRepository["list"]>["orders"][number]): OrderSummaryDto {
  const rawData = parseJson(record.raw) as any;
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
    bestRate: parseJson(record.bestRateJson),
    selectedRate: parseJson(record.selectedRateJson),
    label: {
      shipmentId: record.labelShipmentId,
      trackingNumber: record.labelTracking,
      carrierCode: record.labelCarrier,
      serviceCode: record.labelService,
      shippingProviderId: record.labelProvider,
      cost: record.labelCost,
      rawCost: record.labelRawCost,
      shipDate: record.labelShipDate,
    },
    items,
    raw: rawData,
  };
}

export class ListOrdersService {
  private readonly repository: OrderRepository;

  constructor(repository: OrderRepository) {
    this.repository = repository;
  }

  execute(query: ListOrdersQuery): ListOrdersResponse {
    const result = this.repository.list(query);
    const pages = Math.max(1, Math.ceil(result.total / query.pageSize));

    return {
      orders: result.orders.map(toOrderDto),
      page: query.page,
      pages,
      total: result.total,
    };
  }
}
