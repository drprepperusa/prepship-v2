import type { TransitionalSecrets } from "../../../../../../../packages/shared/src/config/secrets-adapter.ts";
import type { CarrierAccountDto, InitStoreDto } from "../../../../../../../packages/contracts/src/init/contracts.ts";
import type { InitMetadataProvider } from "../application/init-metadata-provider.ts";

interface CacheEntry<T> {
  data: T | null;
  fetchedAt: number;
  ttlMs: number;
}

export class ShipstationInitMetadataProvider implements InitMetadataProvider {
  private readonly storesCache: CacheEntry<InitStoreDto[]>;
  private readonly carriersCache: CacheEntry<unknown[]>;
  private readonly authHeader: string;
  private readonly carrierAccounts: CarrierAccountDto[];

  constructor(secrets: TransitionalSecrets, carrierAccounts: CarrierAccountDto[]) {
    const apiKey = secrets.shipstation?.api_key;
    const apiSecret = secrets.shipstation?.api_secret;
    if (!apiKey || !apiSecret) {
      throw new Error("Transitional ShipStation v1 credentials are required for init metadata");
    }

    this.authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
    this.carrierAccounts = carrierAccounts;
    this.storesCache = { data: null, fetchedAt: 0, ttlMs: 15 * 60 * 1000 };
    this.carriersCache = { data: null, fetchedAt: 0, ttlMs: 24 * 60 * 60 * 1000 };
  }

  async listStores(): Promise<InitStoreDto[]> {
    return this.getCached("https://ssapi.shipstation.com/stores", this.storesCache);
  }

  async listCarriers(): Promise<unknown[]> {
    return this.getCached("https://ssapi.shipstation.com/carriers", this.carriersCache);
  }

  listCarrierAccounts(): CarrierAccountDto[] {
    return [...this.carrierAccounts];
  }

  async refreshCarriers(): Promise<unknown[]> {
    this.carriersCache.data = null;
    this.carriersCache.fetchedAt = 0;
    return this.listCarriers();
  }

  private async getCached<T>(url: string, cache: CacheEntry<T>): Promise<T> {
    if (cache.data && (Date.now() - cache.fetchedAt) < cache.ttlMs) {
      return cache.data;
    }

    try {
      const response = await fetch(url, { headers: { Authorization: this.authHeader } });
      if (!response.ok) {
        throw new Error(`ShipStation metadata request failed: ${response.status}`);
      }

      const data = await response.json() as T;
      cache.data = data;
      cache.fetchedAt = Date.now();
      return data;
    } catch (error) {
      if (cache.data) return cache.data;
      throw error;
    }
  }
}
