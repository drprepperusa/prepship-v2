export interface ExternalCarrierPackageRecord {
  code: string;
  name: string;
  domestic: boolean;
  international: boolean;
  type?: string;
  length?: number;
  width?: number;
  height?: number;
  tareWeightOz?: number;
}

export interface PackageSyncGateway {
  listCarrierPackages(carrierCode: string): Promise<ExternalCarrierPackageRecord[]>;
}
