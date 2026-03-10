import type { TransitionalSecrets } from "../../../../../../../packages/shared/src/config/secrets-adapter.ts";
import type { ExternalCarrierPackageRecord, PackageSyncGateway } from "../application/package-sync-gateway.ts";

export class ShipstationPackageSyncGateway implements PackageSyncGateway {
  private readonly authHeader: string;
  private readonly baseUrl = "https://ssapi.shipstation.com";

  constructor(secrets: TransitionalSecrets) {
    const apiKey = secrets.shipstation?.api_key;
    const apiSecret = secrets.shipstation?.api_secret;
    if (!apiKey || !apiSecret) {
      throw new Error("Transitional ShipStation v1 credentials are required for package sync");
    }
    this.authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
  }

  async listCarrierPackages(carrierCode: string): Promise<ExternalCarrierPackageRecord[]> {
    const response = await fetch(`${this.baseUrl}/carriers/listpackages?carrierCode=${encodeURIComponent(carrierCode)}`, {
      headers: { Authorization: this.authHeader },
    });
    if (!response.ok) {
      throw new Error(`Package sync failed for ${carrierCode}: ${response.status}`);
    }
    const payload = await response.json() as Array<Record<string, unknown>>;
    if (!Array.isArray(payload)) return [];
    return payload.map((entry) => ({
      code: String(entry.code ?? ""),
      name: String(entry.name ?? ""),
      domestic: Boolean(entry.domestic),
      international: Boolean(entry.international),
    })).filter((entry) => entry.code && entry.name);
  }
}
