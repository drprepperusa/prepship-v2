import type {
  AutoCreatePackageInput,
  PackageDto,
  PackageAdjustmentInput,
  SavePackageInput,
} from "../../../../../../packages/contracts/src/packages/contracts.ts";
import type { PackageRecord } from "../domain/package.ts";
import type { ExternalCarrierPackageRecord } from "./package-sync-gateway.ts";

export interface PackageRepository {
  list(source?: string): PackageRecord[];
  listLowStock(): PackageRecord[];
  findByDims(length: number, width: number, height: number): PackageRecord | null;
  getById(packageId: number): PackageRecord | null;
  create(input: SavePackageInput): number;
  update(packageId: number, input: SavePackageInput): void;
  delete(packageId: number): void;
  receive(packageId: number, input: PackageAdjustmentInput): PackageRecord | null;
  adjust(packageId: number, input: PackageAdjustmentInput): PackageRecord | null;
  setReorderLevel(packageId: number, reorderLevel: number): void;
  getLedger(packageId: number): Record<string, unknown>[];
  autoCreate(input: AutoCreatePackageInput): { package: PackageRecord; isNew: boolean };
  syncCarrierPackages(carrierCode: string, packages: ExternalCarrierPackageRecord[]): void;
}
