import type { TransitionalSecrets } from "../../../../../../../packages/shared/src/config/secrets-adapter.ts";
import type {
  LegacySyncStatusDto,
  LegacySyncTriggerResponseDto,
  ShipmentSyncResponseDto,
  ShipmentSyncStatusDto,
} from "../../../../../../../packages/contracts/src/shipments/contracts.ts";
import type { ShipmentRepository } from "./shipment-repository.ts";
import type { ShipstationV1Credentials, ShippingGateway } from "../../labels/application/shipping-gateway.ts";

function credentialsOrThrow(apiKey: string | null | undefined, apiSecret: string | null | undefined, secrets: TransitionalSecrets): ShipstationV1Credentials {
  const key = apiKey ?? secrets.shipstation?.api_key;
  const secret = apiSecret ?? secrets.shipstation?.api_secret;
  if (!key || !secret) {
    throw new Error("No v1 ShipStation credentials configured");
  }
  return { apiKey: key, apiSecret: secret };
}

export class ShipmentServices {
  private readonly repository: ShipmentRepository;
  private readonly gateway: ShippingGateway;
  private readonly secrets: TransitionalSecrets;
  private running = false;
  private legacySyncStatus: LegacySyncStatusDto = {
    status: "idle",
    lastSync: null,
    count: 0,
    error: null,
    page: 0,
    mode: "idle",
    ratesCached: 0,
    ratePrefetchRunning: false,
  };

  constructor(repository: ShipmentRepository, gateway: ShippingGateway, secrets: TransitionalSecrets) {
    this.repository = repository;
    this.gateway = gateway;
    this.secrets = secrets;
  }

  triggerSync(): ShipmentSyncResponseDto {
    this.startSync("incremental");
    return { queued: true };
  }

  triggerLegacySync(full: boolean): LegacySyncTriggerResponseDto {
    this.startSync(full ? "full" : "incremental");
    return { queued: true, mode: full ? "full" : "incremental" };
  }

  getLegacyStatus(): LegacySyncStatusDto {
    return {
      ...this.legacySyncStatus,
      lastSync: this.repository.getLastShipmentSync() ?? this.legacySyncStatus.lastSync,
    };
  }

  private startSync(mode: "incremental" | "full"): void {
    if (!this.running) {
      this.running = true;
      this.legacySyncStatus = {
        ...this.legacySyncStatus,
        status: "syncing",
        error: null,
        page: 0,
        mode,
      };
      void this.runSync(mode).finally(() => {
        this.running = false;
      });
    }
  }

  getStatus(): ShipmentSyncStatusDto {
    return {
      count: this.repository.countActiveShipments(),
      lastSync: this.repository.getLastShipmentSync(),
      running: this.running,
    };
  }

  async list(searchParams: URLSearchParams) {
    const credentials = credentialsOrThrow(null, null, this.secrets);
    const result = await this.gateway.listShipments(credentials, searchParams);
    return result.raw;
  }

  async recordExternalShipment(body: unknown): Promise<{ success: boolean; orderId: number }> {
    // Validate input
    const input = body as Record<string, unknown>;
    const orderId = input.orderId;
    const trackingNumber = input.trackingNumber as string | null | undefined;
    const carrier = input.carrier as string | null | undefined;
    const estimatedDelivery = input.estimatedDelivery as string | null | undefined;

    if (!Number.isFinite(orderId)) {
      throw new Error("orderId is required and must be a number");
    }
    if (!trackingNumber || typeof trackingNumber !== "string") {
      throw new Error("trackingNumber is required");
    }
    if (!carrier || typeof carrier !== "string") {
      throw new Error("carrier is required");
    }

    // Validate order exists
    if (!this.repository.orderExists(orderId)) {
      throw new Error(`Order ${orderId} not found`);
    }

    // Record the external shipment
    const clientId = this.repository.getOrderClientId(orderId);
    const source = "external";
    
    this.repository.recordExternalShipment({
      orderId,
      trackingNumber,
      carrier,
      estimatedDelivery: estimatedDelivery || null,
      clientId,
      source,
    });

    return { success: true, orderId };
  }

  async backfillStoreShipments(storeId: number): Promise<{ synced: number; skipped: number }> {
    // Validate store exists
    if (!this.repository.storeExists(storeId)) {
      throw new Error(`Store ${storeId} not found`);
    }

    const accounts = this.repository.listSyncAccounts();
    const updatedAt = Date.now();
    let totalSynced = 0;
    let totalSkipped = 0;

    // Get all order numbers for this store
    const orderNumbers = this.repository.getOrderNumbersByStoreId(storeId);
    if (orderNumbers.length === 0) {
      return { synced: 0, skipped: 0 };
    }

    try {
      for (const account of accounts) {
        if (!account.v1ApiKey || !account.v1ApiSecret) continue;

        const credentials = credentialsOrThrow(account.v1ApiKey, account.v1ApiSecret, this.secrets);
        const carrierLookup = new Map<string, number>();

        // Build carrier lookup from V2 if available
        if (account.v2ApiKey) {
          let page = 1;
          while (true) {
            const rows = await this.gateway.listShipmentsV2(account.v2ApiKey, page);
            if (rows.length === 0) break;
            for (const row of rows) {
              if (!row.orderNumber || !row.carrierId) continue;
              const numeric = Number.parseInt(row.carrierId.replace(/^se-/, ""), 10);
              if (Number.isFinite(numeric)) carrierLookup.set(row.orderNumber, numeric);
            }
            if (rows.length < 500) break;
            page += 1;
          }
        }

        // Query V1 ShipStation for shipments for these order numbers
        const normalized = [];
        for (const orderNumber of orderNumbers) {
          const params = new URLSearchParams({
            orderNumber,
            pageSize: "500",
            sortBy: "CreateDate",
            sortDir: "DESC",
          });

          const result = await this.gateway.listShipments(credentials, params);
          if (result.shipments.length === 0) {
            totalSkipped += 1;
            continue;
          }

          for (const shipment of result.shipments) {
            let orderId = shipment.orderId;
            if (shipment.orderNumber) {
              const resolved = this.repository.resolveOrderIdByOrderNumber(shipment.orderNumber);
              if (resolved) orderId = resolved;
            }
            if (!this.repository.orderExists(orderId)) {
              totalSkipped += 1;
              continue;
            }

            normalized.push({
              shipmentId: shipment.shipmentId,
              orderId,
              orderNumber: shipment.orderNumber,
              shipmentCost: shipment.shipmentCost,
              otherCost: shipment.otherCost,
              carrierCode: shipment.carrierCode,
              serviceCode: shipment.serviceCode,
              trackingNumber: shipment.trackingNumber,
              shipDate: shipment.shipDate,
              voided: shipment.voided,
              providerAccountId: shipment.orderNumber ? carrierLookup.get(shipment.orderNumber) ?? null : null,
              createDate: shipment.createDate,
              weightOz: shipment.weightOz,
              dimsLength: shipment.dimsLength,
              dimsWidth: shipment.dimsWidth,
              dimsHeight: shipment.dimsHeight,
              updatedAt,
              clientId: this.repository.getOrderClientId(orderId) ?? account.clientId,
              source: "v2-backfill",
            });
          }
        }

        if (normalized.length > 0) {
          this.repository.upsertShipmentBatch(normalized);
          this.repository.backfillOrderLocalFromShipments(normalized);
          totalSynced += normalized.length;
        }
      }

      return { synced: totalSynced, skipped: totalSkipped };
    } catch (error) {
      throw new Error(`Backfill failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async runSync(mode: "incremental" | "full"): Promise<void> {
    const accounts = this.repository.listSyncAccounts();
    const lastSync = this.repository.getLastShipmentSync();
    const createdAtStart = lastSync ? new Date(lastSync - 60_000).toISOString() : undefined;
    const updatedAt = Date.now();
    let totalProcessed = 0;

    try {
      for (const account of accounts) {
        const credentials = credentialsOrThrow(account.v1ApiKey, account.v1ApiSecret, this.secrets);
        const carrierLookup = new Map<string, number>();
        if (account.v2ApiKey) {
          let page = 1;
          while (true) {
            const rows = await this.gateway.listShipmentsV2(account.v2ApiKey, page, createdAtStart);
            if (rows.length === 0) break;
            for (const row of rows) {
              if (!row.orderNumber || !row.carrierId) continue;
              const numeric = Number.parseInt(row.carrierId.replace(/^se-/, ""), 10);
              if (Number.isFinite(numeric)) carrierLookup.set(row.orderNumber, numeric);
            }
            if (rows.length < 500) break;
            page += 1;
          }
        }

        let page = 1;
        while (true) {
          const params = new URLSearchParams({
            pageSize: "500",
            page: String(page),
            sortBy: "CreateDate",
            sortDir: "DESC",
          });
          if (createdAtStart) {
            params.set("modifyDateStart", createdAtStart.replace("T", " ").replace(/\.\d{3}Z$/, ""));
          }
          const result = await this.gateway.listShipments(credentials, params);
          if (result.shipments.length === 0) break;

          const normalized = result.shipments.flatMap((shipment) => {
            let orderId = shipment.orderId;
            if (shipment.orderNumber) {
              const resolved = this.repository.resolveOrderIdByOrderNumber(shipment.orderNumber);
              if (resolved) orderId = resolved;
            }
            if (!this.repository.orderExists(orderId)) return [];
            return [{
              shipmentId: shipment.shipmentId,
              orderId,
              orderNumber: shipment.orderNumber,
              shipmentCost: shipment.shipmentCost,
              otherCost: shipment.otherCost,
              carrierCode: shipment.carrierCode,
              serviceCode: shipment.serviceCode,
              trackingNumber: shipment.trackingNumber,
              shipDate: shipment.shipDate,
              voided: shipment.voided,
              providerAccountId: shipment.orderNumber ? carrierLookup.get(shipment.orderNumber) ?? null : null,
              createDate: shipment.createDate,
              weightOz: shipment.weightOz,
              dimsLength: shipment.dimsLength,
              dimsWidth: shipment.dimsWidth,
              dimsHeight: shipment.dimsHeight,
              updatedAt,
              clientId: this.repository.getOrderClientId(orderId) ?? account.clientId,
              source: "shipstation",
            }];
          });

          if (normalized.length > 0) {
            this.repository.upsertShipmentBatch(normalized);
            this.repository.backfillOrderLocalFromShipments(normalized);
            totalProcessed += normalized.length;
            this.legacySyncStatus = {
              ...this.legacySyncStatus,
              status: "syncing",
              mode,
              page: totalProcessed,
            };
          }

          if (page >= result.pages) break;
          page += 1;
        }
      }

      const completedAt = Date.now();
      this.repository.setLastShipmentSync(completedAt);
      this.legacySyncStatus = {
        ...this.legacySyncStatus,
        status: "done",
        lastSync: completedAt,
        count: totalProcessed,
        error: null,
        page: 0,
        mode,
      };
    } catch (error) {
      this.legacySyncStatus = {
        ...this.legacySyncStatus,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        page: 0,
        mode,
      };
      throw error;
    }
  }
}
