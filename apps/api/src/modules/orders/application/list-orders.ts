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
  return {
    orderId: record.orderId,
    clientId: record.clientId,
    orderNumber: record.orderNumber,
    orderStatus: record.orderStatus,
    orderDate: record.orderDate,
    storeId: record.storeId,
    customerEmail: record.customerEmail,
    shipToName: record.shipToName,
    shipToPostalCode: record.shipToPostalCode,
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
    raw: parseJson(record.raw),
  };
}

export class ListOrdersService {
  private readonly repository: OrderRepository;

  constructor(repository: OrderRepository) {
    this.repository = repository;
  }

  execute(query: ListOrdersQuery): ListOrdersResponse {
    const result = this.repository.list(query);

    return {
      orders: result.orders.map(toOrderDto),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        pages: Math.max(1, Math.ceil(result.total / query.pageSize)),
      },
    };
  }
}
