export interface ProductBulkItemDto {
  sku: string;
  weightOz: number;
  length: number;
  width: number;
  height: number;
  defaultPackageCode?: string | null;
}

export interface ProductDefaultsDto {
  sku: string;
  weightOz: number;
  length: number;
  width: number;
  height: number;
  defaultPackageCode?: string | null;
  _localOnly?: boolean;
}

export interface SaveProductDefaultsInput {
  productId?: number;
  sku?: string;
  weightOz?: number;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  packageCode?: string | null;
  packageId?: number | string | null;
}

export interface SaveProductDefaultsResult {
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
