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

    let rawData = parseJson(record.raw) as any;
    
    // Enrich raw data with database-level externallyFulfilled flag
    // This ensures the frontend can check isExternallyFulfilledOrder(order)
    if (record.externallyFulfilledVerified) {
      if (!rawData) {
        // Create minimal raw object if it doesn't exist
        rawData = {};
      }
      rawData.externallyFulfilled = true;
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
}

