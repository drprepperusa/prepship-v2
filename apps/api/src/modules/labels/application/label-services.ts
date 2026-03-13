import type {
  BatchLabelResultItem,
  CreateBatchLabelRequestDto,
  CreateBatchLabelResponseDto,
  CreateLabelRequestDto,
  CreateLabelResponseDto,
  RetrieveLabelResponseDto,
  ReturnLabelRequestDto,
  ReturnLabelResponseDto,
  VoidLabelResponseDto,
} from "../../../../../../../packages/contracts/src/labels/contracts.ts";
import type { OrderSelectedRateDto } from "../../../../../../../packages/contracts/src/orders/contracts.ts";
import type { TransitionalSecrets } from "../../../../../../../packages/shared/src/config/secrets-adapter.ts";
import type { LabelRepository } from "./label-repository.ts";
import type {
  CreatedExternalLabel,
  ExternalOrderShipmentRecord,
  ShipstationV1Credentials,
  ShippingGateway,
} from "./shipping-gateway.ts";
import { CARRIER_ACCOUNTS_V2 } from "../../../common/prepship-config.ts";
import type { AddressRecord, LabelOrderRecord, LabelShipmentRecord } from "../domain/label.ts";

function parseOrderShipTo(raw: string, fallbackName: string | null): AddressRecord {
  try {
    const parsed = JSON.parse(raw) as { shipTo?: Record<string, unknown> };
    const shipTo = parsed.shipTo ?? {};
    return {
      name: String(shipTo.name ?? fallbackName ?? "Customer"),
      company: shipTo.company ? String(shipTo.company) : undefined,
      street1: String(shipTo.street1 ?? ""),
      street2: shipTo.street2 ? String(shipTo.street2) : undefined,
      city: String(shipTo.city ?? ""),
      state: String(shipTo.state ?? ""),
      postalCode: String(shipTo.postalCode ?? ""),
      country: String(shipTo.country ?? "US"),
      phone: shipTo.phone ? String(shipTo.phone) : undefined,
    };
  } catch {
    return {
      name: fallbackName ?? "Customer",
      street1: "",
      city: "",
      state: "",
      postalCode: "",
      country: "US",
    };
  }
}

function normalizeAddress(input: CreateLabelRequestDto["shipTo"] | CreateLabelRequestDto["shipFrom"] | undefined, fallback: AddressRecord): AddressRecord {
  if (!input?.street1) return fallback;
  return {
    name: input.name || fallback.name,
    company: input.company || undefined,
    street1: input.street1 || "",
    street2: input.street2 || undefined,
    city: input.city || "",
    state: input.state || "",
    postalCode: input.postalCode || "",
    country: input.country || "US",
    phone: input.phone || undefined,
  };
}

function defaultShipFrom(): AddressRecord {
  return {
    name: "PrepShip",
    street1: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
    phone: "000-000-0000",
  };
}

function toV1Credentials(contextApiKey: string | null, contextApiSecret: string | null, secrets: TransitionalSecrets): ShipstationV1Credentials {
  const apiKey = contextApiKey ?? secrets.shipstation?.api_key;
  const apiSecret = contextApiSecret ?? secrets.shipstation?.api_secret;
  if (!apiKey || !apiSecret) {
    throw new Error("No v1 ShipStation credentials configured for this account");
  }
  return { apiKey, apiSecret };
}

function getRefundEstimate(carrierCode: string | null): string {
  if (carrierCode === "stamps_com" || carrierCode === "usps") return "2-5 days (USPS)";
  if (carrierCode === "fedex") return "3-7 days (FedEx)";
  if (carrierCode === "ups") return "3-7 days (UPS)";
  return "2-7 days";
}

function normalizeSyncedShipment(shipment: ExternalOrderShipmentRecord, clientId: number): {
  shipmentId: number;
  orderId: number;
  orderNumber: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
  trackingNumber: string | null;
  shipDate: string | null;
  labelUrl: string | null;
  shipmentCost: number;
  otherCost: number;
  voided: boolean;
  updatedAt: number;
  weightOz: number | null;
  dimsLength: number | null;
  dimsWidth: number | null;
  dimsHeight: number | null;
  createDate: string | null;
  clientId: number;
  providerAccountId: number | null;
  source: string;
  labelCreatedAt: number | null;
  labelFormat: string | null;
  selectedRateJson: string | null;
} {
  return {
    shipmentId: shipment.shipmentId,
    orderId: shipment.orderId,
    orderNumber: shipment.orderNumber,
    carrierCode: shipment.carrierCode,
    serviceCode: shipment.serviceCode,
    trackingNumber: shipment.trackingNumber,
    shipDate: shipment.shipDate,
    labelUrl: null,
    shipmentCost: shipment.shipmentCost,
    otherCost: shipment.otherCost,
    voided: shipment.voided,
    updatedAt: Date.now(),
    weightOz: shipment.weightOz,
    dimsLength: shipment.dimsLength,
    dimsWidth: shipment.dimsWidth,
    dimsHeight: shipment.dimsHeight,
    createDate: shipment.createDate,
    clientId,
    providerAccountId: null,
    source: "shipstation",
    labelCreatedAt: shipment.createDate ? Date.parse(shipment.createDate) : null,
    labelFormat: null,
    selectedRateJson: null,
  };
}

export class LabelServices {
  private readonly repository: LabelRepository;
  private readonly gateway: ShippingGateway;
  private readonly secrets: TransitionalSecrets;

  constructor(repository: LabelRepository, gateway: ShippingGateway, secrets: TransitionalSecrets) {
    this.repository = repository;
    this.gateway = gateway;
    this.secrets = secrets;
  }

  async create(body: CreateLabelRequestDto): Promise<CreateLabelResponseDto> {
    if (!body.orderId || !body.serviceCode) throw new Error("orderId and serviceCode required");
    if (!body.shippingProviderId) throw new Error("shippingProviderId required for v2 label creation");

    const order = this.repository.getOrder(body.orderId);
    if (!order) throw new Error("Order not found");
    if (order.orderStatus === "shipped" || order.orderStatus === "cancelled") {
      throw new Error(`Cannot create label for ${order.orderStatus} order`);
    }

    const existing = this.repository.findActiveLabelForOrder(order.orderId);
    if (existing) {
      const error = new Error("Label already exists for this order") as Error & { details?: Record<string, unknown> };
      error.details = {
        shipmentId: existing.shipmentId,
        trackingNumber: existing.trackingNumber,
        labelUrl: existing.labelUrl,
      };
      throw error;
    }

    const effectiveWeightOz = Number(body.weightOz ?? order.weightValue ?? 0);
    if (!effectiveWeightOz) throw new Error("Order weight required to create label");

    const dims = this.repository.resolvePackageDimensions(order.orderId);
    const length = Number(body.length ?? dims?.length ?? 0) || null;
    const width = Number(body.width ?? dims?.width ?? 0) || null;
    const height = Number(body.height ?? dims?.height ?? 0) || null;

    const fallbackShipTo = parseOrderShipTo(order.raw, order.shipToName);
    const shipTo = normalizeAddress(body.shipTo, fallbackShipTo);
    const shipFrom = normalizeAddress(body.shipFrom, defaultShipFrom());

    const context = this.repository.getShippingAccountContext(order.storeId);
    const apiKeyV2 = context.v2ApiKey ?? this.secrets.shipstation?.api_key_v2;
    if (!apiKeyV2) throw new Error("No v2 API key configured for this account");
    const credentials = toV1Credentials(context.v1ApiKey, context.v1ApiSecret, this.secrets);

    const created = await this.gateway.createLabel({
      apiKeyV2,
      carrierId: `se-${body.shippingProviderId}`,
      serviceCode: body.serviceCode,
      packageCode: body.packageCode || "package",
      weightOz: effectiveWeightOz,
      length,
      width,
      height,
      shipTo,
      shipFrom,
      confirmation: body.confirmation ?? null,
      ssOrderId: order.orderId,
    });

    // V2 provides tracking, labelUrl, cost, shipDate immediately — no V1 wait needed.
    const finalTracking = created.trackingNumber;
    const finalLabelUrl = created.labelUrl ?? null;
    const finalShipDate = created.shipDate ?? new Date().toISOString().slice(0, 10);
    const providerNickname = CARRIER_ACCOUNTS_V2.find((carrier) => carrier.shippingProviderId === created.providerAccountId)?.nickname ?? null;
    const selectedRate: OrderSelectedRateDto = created.selectedRate ?? {
      providerAccountId: created.providerAccountId,
      providerAccountNickname: providerNickname,
      shippingProviderId: created.providerAccountId,
      carrierCode: created.carrierCode,
      serviceName: created.serviceCode,
      serviceCode: created.serviceCode,
      cost: created.cost,
      shipmentCost: created.cost,
      otherCost: 0,
    };

    if (!body.testLabel) {
      const clientId = context.clientId ?? order.clientId;
      if (!clientId) throw new Error(`Cannot insert shipment: clientId lookup failed for storeId ${order.storeId}`);

      // Persist V2 data immediately — otherCost/createDate will be enriched in the background.
      this.repository.saveShipment({
        shipmentId: created.shipmentId,
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        carrierCode: created.carrierCode,
        serviceCode: created.serviceCode,
        trackingNumber: finalTracking,
        shipDate: finalShipDate,
        labelUrl: finalLabelUrl,
        shipmentCost: created.cost,
        otherCost: 0,
        voided: created.voided,
        updatedAt: Date.now(),
        weightOz: effectiveWeightOz,
        dimsLength: length,
        dimsWidth: width,
        dimsHeight: height,
        createDate: new Date().toISOString(),
        clientId,
        providerAccountId: created.providerAccountId,
        source: "prepship_v2",
        labelCreatedAt: Date.now(),
        labelFormat: "pdf",
        selectedRateJson: JSON.stringify(selectedRate),
      });

      if (finalTracking) {
        this.repository.backfillOrderLocalTracking(order.orderId, finalTracking, created.providerAccountId, Math.floor(Date.now() / 1000));
      }
      this.repository.markOrderShipped(order.orderId, Date.now());

      // Kick off V1 enrichment in the background — user is NOT blocked by this.
      void this.runV1EnrichmentBackground(credentials, created, order, effectiveWeightOz, clientId);
    }

    return {
      shipmentId: created.shipmentId,
      trackingNumber: finalTracking,
      labelUrl: body.testLabel ? null : finalLabelUrl,
      cost: created.cost,
      voided: created.voided,
      orderStatus: body.testLabel ? order.orderStatus : "shipped",
      apiVersion: "v2",
    };
  }

  /**
   * Background task: notify V1 that the order shipped, then fetch V1 enrichment data
   * (otherCost, createDate, weightOz, dimensions) and sync all shipments for the order.
   * Failures here are logged but never surface to the user.
   */
  private async runV1EnrichmentBackground(
    credentials: ShipstationV1Credentials,
    created: CreatedExternalLabel,
    order: LabelOrderRecord,
    effectiveWeightOz: number,
    clientId: number,
  ): Promise<void> {
    const tag = `[V1 enrichment] shipmentId=${created.shipmentId} orderId=${order.orderId}`;
    try {
      const finalShipDate = created.shipDate ?? new Date().toISOString().slice(0, 10);

      // 1. Mark order shipped in ShipStation V1 (best-effort — keeps SS in sync).
      if (created.trackingNumber) {
        try {
          await this.gateway.markOrderShipped(credentials, {
            orderId: order.orderId,
            carrierCode: created.carrierCode,
            shipDate: finalShipDate,
            trackingNumber: created.trackingNumber,
          });
        } catch (err) {
          console.error(`${tag} markOrderShipped failed (non-fatal):`, err);
        }
      }

      // 2. Fetch V1 shipment details for enrichment fields.
      const enriched = await this.gateway.getShipment(credentials, created.shipmentId);
      if (enriched) {
        this.repository.enrichShipment({
          shipmentId: created.shipmentId,
          otherCost: enriched.otherCost ?? 0,
          createDate: enriched.createDate ?? null,
          weightOz: enriched.weightOz ?? effectiveWeightOz,
          dimsLength: enriched.dimsLength ?? null,
          dimsWidth: enriched.dimsWidth ?? null,
          dimsHeight: enriched.dimsHeight ?? null,
          updatedAt: Date.now(),
        });
        console.log(`${tag} enriched: otherCost=${enriched.otherCost} createDate=${enriched.createDate}`);
      } else {
        console.warn(`${tag} getShipment returned null — enrichment skipped`);
      }

      // 3. Sync all V1 shipments for this order.
      const syncedShipments = await this.gateway.listOrderShipments(credentials, order.orderId);
      for (const shipment of syncedShipments) {
        this.repository.saveShipment(normalizeSyncedShipment(shipment, clientId));
      }
      console.log(`${tag} synced ${syncedShipments.length} V1 shipment(s)`);
    } catch (err) {
      console.error(`${tag} background enrichment error (non-fatal):`, err);
    }
  }

  async createBatch(body: CreateBatchLabelRequestDto): Promise<CreateBatchLabelResponseDto> {
    const created: BatchLabelResultItem[] = [];
    const failed: BatchLabelResultItem[] = [];

    for (const orderId of body.orderIds) {
      try {
        const result = await this.create({
          orderId,
          serviceCode: body.serviceCode,
          carrierCode: body.carrierCode,
          packageCode: body.packageCode,
          confirmation: body.confirmation,
          testLabel: body.testLabel,
          shippingProviderId: body.shippingProviderId,
        });
        created.push({
          orderId,
          success: true,
          shipmentId: result.shipmentId,
          trackingNumber: result.trackingNumber,
          cost: result.cost,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        failed.push({ orderId, success: false, error: message });
      }
    }

    return {
      created,
      failed,
      summary: {
        total: body.orderIds.length,
        created: created.length,
        failed: failed.length,
      },
    };
  }

  async void(shipmentId: number): Promise<VoidLabelResponseDto> {
    const shipment = this.repository.getShipmentForVoidOrReturn(shipmentId);
    if (!shipment) throw new Error("Shipment not found");
    if (shipment.voided) throw new Error("Label already voided");

    const context = this.repository.getShippingAccountContext(shipment.storeId);
    const apiKeyV2 = context.v2ApiKey ?? this.secrets.shipstation?.api_key_v2;
    if (!apiKeyV2) throw new Error("No v2 API key configured for this account");

    await this.gateway.voidShipment(apiKeyV2, shipmentId);
    const now = Date.now();
    this.repository.markShipmentVoided(shipmentId, shipment.orderId, now);

    return {
      success: true,
      shipmentId,
      orderNumber: shipment.orderNumber,
      voided: true,
      voidedAt: new Date(now).toISOString(),
      trackingNumber: shipment.trackingNumber,
      refundAmount: shipment.shipmentCost ?? null,
      refundInitiated: true,
      refundEstimate: getRefundEstimate(shipment.carrierCode),
      note: 'Order status reset to "Awaiting Shipment"; you can create a new label.',
    };
  }

  async createReturn(shipmentId: number, body: ReturnLabelRequestDto): Promise<ReturnLabelResponseDto> {
    const shipment = this.repository.getShipmentForVoidOrReturn(shipmentId);
    if (!shipment) throw new Error("Shipment not found");

    const context = this.repository.getShippingAccountContext(shipment.storeId);
    const apiKeyV2 = context.v2ApiKey ?? this.secrets.shipstation?.api_key_v2;
    if (!apiKeyV2) throw new Error("No v2 API key configured for this account");

    const reason = body.reason || "Customer Return";
    const result = await this.gateway.createReturnLabel(apiKeyV2, shipmentId, reason);
    const createdAt = Date.now();
    this.repository.saveReturnLabel({
      shipmentId,
      returnShipmentId: result.returnShipmentId,
      returnTrackingNumber: result.returnTrackingNumber,
      reason,
      createdAt,
    });

    return {
      success: true,
      shipmentId,
      orderNumber: shipment.orderNumber,
      returnTrackingNumber: result.returnTrackingNumber,
      returnShipmentId: result.returnShipmentId,
      cost: result.cost,
      reason,
      createdAt: new Date(createdAt).toISOString(),
    };
  }

  async retrieve(orderLookup: number | string, fresh: boolean): Promise<RetrieveLabelResponseDto> {
    const shipment = this.repository.getLatestShipmentForOrderLookup(orderLookup);
    if (!shipment) throw new Error("No active label found for this order");

    let labelUrl = shipment.labelUrl;
    if (fresh || !labelUrl) {
      labelUrl = await this.findFreshLabelUrl(shipment);
      if (labelUrl && labelUrl !== shipment.labelUrl) {
        this.repository.updateShipmentLabelUrl(shipment.shipmentId, labelUrl);
      }
    }

    if (!labelUrl) {
      if (shipment.source === "shipstation") {
        throw new Error(`Label was created in ShipStation before label tracking was enabled. Access it directly in ShipStation or use tracking number ${shipment.trackingNumber || "N/A"}`);
      }
      throw new Error("Label URL not available. The label may have been voided or deleted.");
    }

    return {
      orderId: shipment.orderId,
      orderNumber: shipment.orderNumber,
      shipmentId: shipment.shipmentId,
      trackingNumber: shipment.trackingNumber,
      labelUrl,
      createdAt: shipment.labelCreatedAt ? new Date(shipment.labelCreatedAt).toISOString() : null,
      carrier: shipment.carrierCode || "unknown",
      service: shipment.serviceCode || "unknown",
      cost: shipment.shipmentCost ?? 0,
    };
  }

  private async findFreshLabelUrl(shipment: LabelShipmentRecord): Promise<string | null> {
    const context = this.repository.getShippingAccountContext(shipment.storeId);
    const apiKeyV2 = context.v2ApiKey ?? this.secrets.shipstation?.api_key_v2;
    if (apiKeyV2) {
      const labels = await this.gateway.listRecentLabels(apiKeyV2);
      if (shipment.source === "prepship_v2") {
        const labelId = `se-${shipment.shipmentId}`;
        const match = labels.find((entry) => entry.labelId === labelId);
        if (match?.labelUrl) return match.labelUrl;
      }
      if (shipment.trackingNumber) {
        const match = labels.find((entry) => entry.trackingNumber === shipment.trackingNumber);
        if (match?.labelUrl) return match.labelUrl;
      }
    }

    const credentials = toV1Credentials(context.v1ApiKey, context.v1ApiSecret, this.secrets);
    const details = await this.gateway.getShipment(credentials, shipment.shipmentId);
    return details?.labelUrl ?? null;
  }
}
