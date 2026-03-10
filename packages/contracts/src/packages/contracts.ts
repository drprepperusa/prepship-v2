export interface PackageDto {
  packageId: number;
  name: string;
  type: string;
  length: number;
  width: number;
  height: number;
  tareWeightOz: number;
  source: string | null;
  carrierCode: string | null;
  stockQty?: number | null;
  reorderLevel?: number | null;
  unitCost?: number | null;
}

export interface SavePackageInput {
  name: string;
  type?: string;
  length?: number;
  width?: number;
  height?: number;
  tareWeightOz?: number;
  reorderLevel?: number | null;
  unitCost?: number | null;
}

export interface PackageAdjustmentInput {
  qty: number;
  note?: string;
  costPerUnit?: number | null;
}

export interface AutoCreatePackageInput {
  length: number;
  width: number;
  height: number;
  sku?: string | null;
  clientId?: number | null;
}
