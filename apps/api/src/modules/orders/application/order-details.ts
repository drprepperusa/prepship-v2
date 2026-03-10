import type { OrderSummaryDto } from "../../../../../../packages/contracts/src/orders/contracts.ts";
import type { OrderRepository } from "./order-repository.ts";

function parseJson(value: string | null): unknown | null {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export class OrderDetailsService {
  private readonly repository: OrderRepository;

  constructor(repository: OrderRepository) {
    this.repository = repository;
  }

  execute(orderId: number): OrderSummaryDto | null {
    const record = this.repository.getById(orderId);

    if (!record) {
      return null;
    }

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
}

