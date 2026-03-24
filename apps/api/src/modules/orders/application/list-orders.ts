import type {
  ListOrdersQuery,
  ListOrdersResponse,
  OrderSummaryDto,
} from "../../../../../../packages/contracts/src/orders/contracts.ts";
import type { OrderRepository } from "./order-repository.ts";
import type { RateServices } from "../../rates/application/rate-services.ts";
import type { ShipstationResidentialGateway } from "../data/shipstation-residential-gateway.ts";
import {
  normalizeOrderBestRateDto,
  normalizeOrderSelectedRateDto,
  parseOrderRateJson,
} from "./order-rate-dto.ts";
import { CARRIER_ACCOUNTS_V2 } from "../../../common/prepship-config.ts";

function resolveCarrierNickname(
  providerAccountId: number | null,
  carrierCode: string | null,
  trackingNumber?: string | null,
): string | null {
  if (!carrierCode) return null;

  // 1. Exact match by providerAccountId
  if (providerAccountId) {
    const exact = CARRIER_ACCOUNTS_V2.find((a) => a.shippingProviderId === providerAccountId);
    if (exact) return exact.nickname;
  }

  // 2. UPS: decode account code from tracking number (format: 1Z[acct6][service2][seq8][check1])
  if ((carrierCode === "ups" || carrierCode === "ups_walleted") && trackingNumber) {
    const tn = trackingNumber.replace(/\s/g, "").toUpperCase();
    if (tn.startsWith("1Z") && tn.length >= 8) {
      const acctCode = tn.slice(2, 8); // chars 3-8 = UPS account code
      const matched = CARRIER_ACCOUNTS_V2.find((a) =>
        (a.carrierCode === "ups" || a.carrierCode === "ups_walleted") &&
        a.accountNumber?.toUpperCase() === acctCode
      );
      if (matched) return matched.nickname;
    }
  }

  // 3. Single account for this carrierCode
  const matching = CARRIER_ACCOUNTS_V2.filter((a) => a.carrierCode === carrierCode);
  if (matching.length === 1) return matching[0]!.nickname;

  // 4. Last resort: readable carrier name (should rarely hit this)
  const CARRIER_DISPLAY: Record<string, string> = {
    stamps_com: "USPS", ups: "UPS", ups_walleted: "UPS", fedex: "FedEx",
    fedex_walleted: "FedEx One Balance", dhl_express: "DHL Express",
  };
  return CARRIER_DISPLAY[carrierCode] ?? carrierCode.replace(/_/g, " ").toUpperCase();
}

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
  
  // bestRate is ONLY for awaiting_shipment orders (used for rate shopping UI).
  // Shipped/cancelled orders must never expose bestRate — it is stale and misleading.
  // selectedRate (from shipments table) is the source of truth for shipped orders.
  let bestRate = null;
  if (record.orderStatus === "awaiting_shipment") {
    bestRate = normalizeOrderBestRateDto(parseOrderRateJson(record.bestRateJson, `order ${record.orderId} bestRateJson`));
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
    selectedRate: (() => {
      // For shipped orders: selectedRate comes ONLY from shipments table data.
      // Never fall back to bestRate or best_rate_json for shipped orders.
      const parsed = parseOrderRateJson(record.selectedRateJson, `order ${record.orderId} selectedRateJson`);
      const fallback = {
        providerAccountId: record.labelProvider,
        carrierCode: record.labelCarrier,
        serviceCode: record.labelService,
        shipmentCost: record.labelRawCost,
        otherCost: record.labelCost != null && record.labelRawCost != null
          ? record.labelCost - record.labelRawCost
          : null,
      };

      // If we have parsed selectedRate json, use it with shipment fallback
      if (parsed != null) {
        return normalizeOrderSelectedRateDto(parsed, fallback, `order ${record.orderId} selectedRate`);
      }

      // No stored selectedRate json — for shipped orders, build from shipment record data
      if (record.orderStatus === "shipped" && (record.labelCarrier || record.labelService || record.labelProvider)) {
        const nickname = resolveCarrierNickname(record.labelProvider, record.labelCarrier, record.labelTracking);
        return normalizeOrderSelectedRateDto(
          {
            providerAccountId: record.labelProvider,
            providerAccountNickname: nickname,
            carrierCode: record.labelCarrier,
            serviceCode: record.labelService,
            shipmentCost: record.labelRawCost,
            otherCost: 0,
          },
          fallback,
          `order ${record.orderId} selectedRate`,
        );
      }

      return null;
    })(),
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
      labelUrl: record.labelUrl,
    },
    items,
    raw: rawData,
  };
}

export class ListOrdersService {
  private readonly repository: OrderRepository;
  private readonly rateServices: RateServices | null;
  private readonly residentialGateway: ShipstationResidentialGateway | null;

  constructor(
    repository: OrderRepository,
    rateServices?: RateServices,
    residentialGateway?: ShipstationResidentialGateway,
  ) {
    this.repository = repository;
    this.rateServices = rateServices ?? null;
    this.residentialGateway = residentialGateway ?? null;
  }

  async execute(query: ListOrdersQuery): Promise<ListOrdersResponse> {
    const result = this.repository.list(query);

    // Enrich orders with ShipStation residential status BEFORE mapping to DTO
    // This ensures rates are fetched with the correct residential flag
    if (this.residentialGateway && result.orders.length > 0) {
      const residentialResults = await this.residentialGateway.lookupResidential(
        result.orders.map((record) => ({
          orderId: record.orderId,
          shipStationOrderNumber: record.orderNumber,
        })),
      );

      // Merge ShipStation residential status into records
      const residentialMap = new Map(
        residentialResults
          .filter((r) => r.residential !== null)
          .map((r) => [r.orderId, r.residential]),
      );

      for (const record of result.orders) {
        const ssResidential = residentialMap.get(record.orderId);
        if (ssResidential !== undefined) {
          // Update sourceResidential if ShipStation provided a value
          record.sourceResidential = ssResidential;
        }
      }
    }

    const pages = Math.max(1, Math.ceil(result.total / query.pageSize));

    return {
      orders: result.orders.map((record) => toOrderDto(record, this.rateServices)),
      page: query.page,
      pages,
      total: result.total,
    };
  }
}
