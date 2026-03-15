import type { TransitionalSecrets } from "../../../../../../../packages/shared/src/config/secrets-adapter.ts";
import type {
  CreateExternalLabelInput,
  CreatedExternalLabel,
  ExternalOrderShipmentRecord,
  MarkOrderShippedInput,
  ReturnLabelResult,
  ShipmentPageResult,
  ShippingGateway,
  ShipstationLabelRecord,
  ShipstationShipmentDetails,
  ShipstationV1Credentials,
} from "../application/shipping-gateway.ts";

function basicAuth(credentials: ShipstationV1Credentials): string {
  return `Basic ${Buffer.from(`${credentials.apiKey}:${credentials.apiSecret}`).toString("base64")}`;
}

function parseNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseWeightOz(weight: Record<string, unknown> | null | undefined): number | null {
  if (!weight) return null;
  const value = parseNumber(weight.value);
  if (value == null) return null;
  const units = String(weight.units ?? "ounces").toLowerCase();
  if (units === "pounds") return value * 16;
  if (units === "grams") return value * 0.035274;
  return value;
}

function parseDims(dimensions: Record<string, unknown> | null | undefined): { length: number | null; width: number | null; height: number | null } {
  if (!dimensions) return { length: null, width: null, height: null };
  const factor = String(dimensions.units ?? "inches").toLowerCase().startsWith("c") ? 0.393701 : 1;
  return {
    length: parseNumber(dimensions.length) != null ? Number((Number(dimensions.length) * factor).toFixed(2)) : null,
    width: parseNumber(dimensions.width) != null ? Number((Number(dimensions.width) * factor).toFixed(2)) : null,
    height: parseNumber(dimensions.height) != null ? Number((Number(dimensions.height) * factor).toFixed(2)) : null,
  };
}

function mapShipmentPayload(payload: Record<string, unknown>): ExternalOrderShipmentRecord {
  const dims = parseDims(payload.dimensions as Record<string, unknown> | undefined);
  return {
    shipmentId: Number(payload.shipmentId),
    orderId: Number(payload.orderId),
    orderNumber: payload.orderNumber ? String(payload.orderNumber) : null,
    shipmentCost: Number(payload.shipmentCost ?? 0),
    otherCost: Number(payload.otherCost ?? 0),
    carrierCode: payload.carrierCode ? String(payload.carrierCode) : null,
    serviceCode: payload.serviceCode ? String(payload.serviceCode) : null,
    trackingNumber: payload.trackingNumber ? String(payload.trackingNumber) : null,
    shipDate: payload.shipDate ? String(payload.shipDate) : null,
    voided: Boolean(payload.voided),
    createDate: payload.createDate ? String(payload.createDate) : null,
    weightOz: parseWeightOz(payload.weight as Record<string, unknown> | undefined),
    dimsLength: dims.length,
    dimsWidth: dims.width,
    dimsHeight: dims.height,
  };
}

export class ShipstationShippingGateway implements ShippingGateway {
  private readonly secrets: TransitionalSecrets;
  private readonly baseV1 = "https://ssapi.shipstation.com";
  private readonly baseV2 = "https://api.shipstation.com/v2";

  constructor(secrets: TransitionalSecrets) {
    this.secrets = secrets;
  }

  async createLabel(input: CreateExternalLabelInput): Promise<CreatedExternalLabel> {
    const pkg: Record<string, unknown> = {
      weight: { value: Number(input.weightOz.toFixed(2)), unit: "ounce" },
      package_code: input.packageCode || "package",
    };
    if (input.length && input.width && input.height) {
      pkg.dimensions = {
        length: Number(input.length.toFixed(2)),
        width: Number(input.width.toFixed(2)),
        height: Number(input.height.toFixed(2)),
        unit: "inch",
      };
    }

    const body = {
      shipment: {
        carrier_id: input.carrierId,
        service_code: input.serviceCode,
        ship_date: new Date().toISOString().slice(0, 10),
        ship_from: {
          name: input.shipFrom.name,
          company_name: input.shipFrom.company,
          address_line1: input.shipFrom.street1,
          address_line2: input.shipFrom.street2,
          city_locality: input.shipFrom.city,
          state_province: input.shipFrom.state,
          postal_code: input.shipFrom.postalCode,
          country_code: input.shipFrom.country,
          phone: input.shipFrom.phone || "000-000-0000",
        },
        ship_to: {
          name: input.shipTo.name,
          company_name: input.shipTo.company,
          address_line1: input.shipTo.street1,
          address_line2: input.shipTo.street2,
          city_locality: input.shipTo.city,
          state_province: input.shipTo.state,
          postal_code: input.shipTo.postalCode,
          country_code: input.shipTo.country,
          phone: input.shipTo.phone || "000-000-0000",
        },
        packages: [pkg],
        confirmation: input.confirmation || "none",
        order_id: `se-${input.ssOrderId}`,
        external_order_id: input.orderNumber ?? undefined,
      },
      is_return_label: false,
      label_layout: "4x6",
      label_format: "pdf",
      label_download_type: "url",
      ...(input.testLabel ? { test_label: true } : {}),
    };

    const response = await fetch(`${this.baseV2}/labels`, {
      method: "POST",
      headers: { "API-Key": input.apiKeyV2, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const details = await response.text();
      const error = new Error(`ShipStation v2 API error: ${response.status}`) as Error & { details?: string; statusCode?: number };
      error.details = details.slice(0, 300);
      error.statusCode = response.status;
      throw error;
    }

    const payload = await response.json() as Record<string, unknown>;
    const shipmentId = Number(String(payload.shipment_id ?? "").replace(/^se-/, ""));
    const providerAccountId = Number(String(input.carrierId).replace(/^se-/, ""));

    return {
      shipmentId,
      trackingNumber: payload.tracking_number ? String(payload.tracking_number) : null,
      labelUrl: ((payload.label_download as Record<string, unknown> | undefined)?.pdf ?? (payload.label_download as Record<string, unknown> | undefined)?.href ?? null) as string | null,
      cost: Number((payload.shipment_cost as Record<string, unknown> | undefined)?.amount ?? 0),
      voided: Boolean(payload.voided),
      carrierCode: payload.carrier_code ? String(payload.carrier_code) : null,
      serviceCode: payload.service_code ? String(payload.service_code) : input.serviceCode,
      shipDate: payload.ship_date ? String(payload.ship_date) : new Date().toISOString().slice(0, 10),
      providerAccountId: Number.isFinite(providerAccountId) ? providerAccountId : null,
      selectedRate: {
        providerAccountId: Number.isFinite(providerAccountId) ? providerAccountId : null,
        providerAccountNickname: null,
        shippingProviderId: Number.isFinite(providerAccountId) ? providerAccountId : null,
        serviceName: payload.service_code ? String(payload.service_code) : input.serviceCode,
        serviceCode: payload.service_code ? String(payload.service_code) : input.serviceCode,
        carrierCode: payload.carrier_code ? String(payload.carrier_code) : null,
        cost: Number((payload.shipment_cost as Record<string, unknown> | undefined)?.amount ?? 0),
        shipmentCost: Number((payload.shipment_cost as Record<string, unknown> | undefined)?.amount ?? 0),
        otherCost: 0,
      },
    };
  }

  async getShipment(credentials: ShipstationV1Credentials, shipmentId: number): Promise<ShipstationShipmentDetails | null> {
    const response = await fetch(`${this.baseV1}/shipments/${shipmentId}`, {
      headers: { Authorization: basicAuth(credentials) },
    });
    if (!response.ok) return null;
    const data = await response.json() as Record<string, unknown>;
    const shipment = ((data.shipment as Record<string, unknown> | undefined) ?? data);
    const dims = parseDims(shipment.dimensions as Record<string, unknown> | undefined);
    return {
      shipmentId: Number(shipment.shipmentId ?? shipmentId),
      orderId: Number(shipment.orderId ?? 0),
      orderNumber: shipment.orderNumber ? String(shipment.orderNumber) : null,
      trackingNumber: shipment.trackingNumber ? String(shipment.trackingNumber) : null,
      carrierCode: shipment.carrierCode ? String(shipment.carrierCode) : null,
      serviceCode: shipment.serviceCode ? String(shipment.serviceCode) : null,
      shipmentCost: Number(shipment.shipmentCost ?? 0),
      otherCost: Number(shipment.otherCost ?? 0),
      shipDate: shipment.shipDate ? String(shipment.shipDate) : null,
      confirmation: shipment.confirmation ? String(shipment.confirmation) : null,
      voided: Boolean(shipment.voided),
      labelUrl: ((shipment.labelDownload as Record<string, unknown> | undefined)?.pdf ?? (shipment.labelDownload as Record<string, unknown> | undefined)?.href ?? (shipment.label_download as Record<string, unknown> | undefined)?.pdf ?? null) as string | null,
      createDate: shipment.createDate ? String(shipment.createDate) : null,
      weightOz: parseWeightOz(shipment.weight as Record<string, unknown> | undefined),
      dimsLength: dims.length,
      dimsWidth: dims.width,
      dimsHeight: dims.height,
      providerAccountId: parseNumber((shipment.advancedOptions as Record<string, unknown> | undefined)?.billToMyOtherAccount ?? null),
    };
  }

  async markOrderShipped(credentials: ShipstationV1Credentials, input: MarkOrderShippedInput): Promise<boolean> {
    const response = await fetch(`${this.baseV1}/orders/markasshipped`, {
      method: "POST",
      headers: { Authorization: basicAuth(credentials), "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: input.orderId,
        carrierCode: input.carrierCode,
        shipDate: input.shipDate,
        trackingNumber: input.trackingNumber,
        notifyCustomer: false,
        notifySalesChannel: true,
      }),
    });
    return response.ok;
  }

  async voidShipment(apiKeyV2: string, shipmentId: number): Promise<void> {
    const response = await fetch(`${this.baseV2}/shipments/${shipmentId}/void`, {
      method: "POST",
      headers: { "API-Key": apiKeyV2, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Failed to void label (${response.status})`);
    }
  }

  async createReturnLabel(apiKeyV2: string, shipmentId: number, reason: string): Promise<ReturnLabelResult> {
    const response = await fetch(`${this.baseV2}/shipments/${shipmentId}/returnlabel`, {
      method: "POST",
      headers: { "API-Key": apiKeyV2, "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `ShipStation API error: ${response.status}`);
    }
    const payload = await response.json() as Record<string, unknown>;
    return {
      returnTrackingNumber: String(payload.trackingNumber ?? payload.tracking_number ?? ""),
      returnShipmentId: parseNumber(payload.shipmentId ?? payload.shipment_id),
      cost: Number(payload.shipmentCost ?? payload.shipment_cost ?? 0),
    };
  }

  async listRecentLabels(apiKeyV2: string): Promise<ShipstationLabelRecord[]> {
    const response = await fetch(`${this.baseV2}/labels?limit=1000&sort=-created_at`, {
      headers: { "API-Key": apiKeyV2 },
    });
    if (!response.ok) return [];
    const payload = await response.json() as { labels?: Array<Record<string, unknown>> };
    return (payload.labels ?? []).map((label) => ({
      labelId: label.label_id ? String(label.label_id) : null,
      trackingNumber: label.tracking_number ? String(label.tracking_number) : null,
      labelUrl: ((label.label_download as Record<string, unknown> | undefined)?.pdf ?? (label.label_download as Record<string, unknown> | undefined)?.href ?? null) as string | null,
    }));
  }

  async listOrderShipments(credentials: ShipstationV1Credentials, orderId: number): Promise<ExternalOrderShipmentRecord[]> {
    const response = await fetch(`${this.baseV1}/orders/${orderId}`, {
      headers: { Authorization: basicAuth(credentials) },
    });
    if (!response.ok) return [];
    const payload = await response.json() as { shipments?: Array<Record<string, unknown>> };
    return (payload.shipments ?? []).map(mapShipmentPayload);
  }

  async listShipments(credentials: ShipstationV1Credentials, searchParams: URLSearchParams): Promise<ShipmentPageResult> {
    const url = `${this.baseV1}/shipments?${searchParams.toString()}`;
    const response = await fetch(url, { headers: { Authorization: basicAuth(credentials) } });
    if (!response.ok) {
      throw new Error(`Shipments proxy failed: ${response.status}`);
    }
    const payload = await response.json() as {
      shipments?: Array<Record<string, unknown>>;
      page?: number;
      pages?: number;
      total?: number;
    };
    return {
      shipments: (payload.shipments ?? []).map(mapShipmentPayload),
      page: payload.page ?? 1,
      pages: payload.pages ?? 1,
      total: payload.total ?? ((payload.shipments ?? []).length),
      raw: payload,
    };
  }

  async listShipmentsV2(apiKeyV2: string, page: number, createdAtStart?: string) {
    const params = new URLSearchParams({
      page_size: "500",
      page: String(page),
      sort_dir: "DESC",
    });
    if (createdAtStart) params.set("created_at_start", createdAtStart);
    const response = await fetch(`${this.baseV2}/shipments?${params.toString()}`, {
      headers: { "API-Key": apiKeyV2 },
    });
    if (!response.ok) return [];
    const payload = await response.json() as { shipments?: Array<Record<string, unknown>> };
    return (payload.shipments ?? []).map((shipment) => ({
      orderNumber: shipment.shipment_number ? String(shipment.shipment_number) : null,
      orderId: parseNumber(shipment.order_id),
      carrierId: shipment.carrier_id ? String(shipment.carrier_id) : null,
    }));
  }
}
