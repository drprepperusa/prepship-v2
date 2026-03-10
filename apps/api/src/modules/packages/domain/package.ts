export interface PackageRecord {
  packageId: number;
  name: string;
  type: string | null;
  length: number | null;
  width: number | null;
  height: number | null;
  tareWeightOz: number | null;
  source: string | null;
  carrierCode: string | null;
  stockQty: number | null;
  reorderLevel: number | null;
  unitCost: number | null;
}

