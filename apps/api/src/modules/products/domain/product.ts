export interface ProductDefaultsRecord {
  sku: string;
  weightOz: number;
  length: number;
  width: number;
  height: number;
  defaultPackageCode?: string | null;
  _localOnly?: boolean;
}

export interface SaveProductDefaultsRecordResult {
  ok: true;
  localOnly?: boolean;
  productId?: number;
  sku?: string;
  saved?: Record<string, unknown>;
  resolvedPackageId?: number | null;
  newPackageCreated?: boolean;
  packageData?: {
    packageId: number;
    name: string;
    length: number | null;
    width: number | null;
    height: number | null;
    source: string | null;
  } | null;
}
