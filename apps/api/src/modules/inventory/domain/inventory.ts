export interface InventoryRecord {
  id: number;
  clientId: number;
  sku: string;
  name: string;
  minStock: number;
  active: boolean;
  weightOz: number;
  parentSkuId: number | null;
  baseUnitQty: number;
  packageLength: number;
  packageWidth: number;
  packageHeight: number;
  productLength: number;
  productWidth: number;
  productHeight: number;
  packageId: number | null;
  unitsPerPack: number;
  cuFtOverride: number | null;
  clientName: string;
  packageName: string | null;
  packageDimLength: number | null;
  packageDimWidth: number | null;
  packageDimHeight: number | null;
  parentName: string | null;
  currentStock: number;
  lastMovement: number | null;
  imageUrl: string | null;
}

export interface InventoryAlertRecord {
  type: "sku" | "parent";
  id: number;
  sku?: string;
  name: string;
  stock: number;
  minStock: number;
  parentSkuId: number | null;
}
