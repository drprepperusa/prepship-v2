import type {
  AutoCreatePackageInput,
  PackageAdjustmentInput,
  SavePackageInput,
} from "../../../../../../packages/contracts/src/packages/contracts.ts";
import type { PackageServices } from "../application/package-services.ts";

export class PackagesHttpHandler {
  private readonly services: PackageServices;

  constructor(services: PackageServices) {
    this.services = services;
  }

  handleList(source?: string) {
    return this.services.list(source);
  }

  handleCreate(body: SavePackageInput) {
    return this.services.create(body);
  }

  handleLowStock() {
    return this.services.lowStock();
  }

  handleFindByDims(length: number, width: number, height: number) {
    return this.services.findByDims(length, width, height);
  }

  handleAutoCreate(body: AutoCreatePackageInput) {
    return this.services.autoCreate(body);
  }

  handleGetById(packageId: number) {
    return this.services.getById(packageId);
  }

  handleUpdate(packageId: number, body: SavePackageInput) {
    return this.services.update(packageId, body);
  }

  handleDelete(packageId: number) {
    return this.services.delete(packageId);
  }

  handleReceive(packageId: number, body: PackageAdjustmentInput) {
    return this.services.receive(packageId, body);
  }

  handleAdjust(packageId: number, body: PackageAdjustmentInput) {
    return this.services.adjust(packageId, body);
  }

  handleSetReorderLevel(packageId: number, reorderLevel: number) {
    return this.services.setReorderLevel(packageId, reorderLevel);
  }

  handleLedger(packageId: number) {
    return this.services.ledger(packageId);
  }

  handleSync() {
    return this.services.sync();
  }
}
