import type { OrderOverrideInput } from "../../../../../../packages/contracts/src/orders/contracts.ts";
import type { OrderRepository } from "./order-repository.ts";

export class UpdateOrderOverridesService {
  readonly repository: OrderRepository;

  constructor(repository: OrderRepository) {
    this.repository = repository;
  }

  setExternalShipped(orderId: number, externalShipped: boolean) {
    this.repository.updateExternalShipped(orderId, externalShipped);
    return { ok: true, orderId, external_shipped: externalShipped ? 1 : 0 };
  }

  setResidential(orderId: number, residential: boolean | null) {
    this.repository.updateResidential(orderId, residential);
    return { ok: true, orderId, residential: residential == null ? null : residential ? 1 : 0 };
  }

  setSelectedPid(orderId: number, selectedPid: number | null) {
    this.repository.updateSelectedPid(orderId, selectedPid);
    return { ok: true, orderId, selectedPid };
  }

  setBestRate(input: OrderOverrideInput) {
    if (input.bestRate == null) {
      throw new Error("best + orderId required");
    }
    this.repository.updateBestRate(input.orderId, input.bestRate, input.bestRateDims ?? null);
    return { ok: true };
  }

  saveDims(orderId: number, sku: string | null, qty: number | null, length: number, width: number, height: number) {
    if (length <= 0 || width <= 0 || height <= 0) {
      throw new Error("length, width, height must all be > 0");
    }
    // Always save to per-order dims
    this.repository.updateOrderRateDims(orderId, length, width, height);
    // Save to sku_qty_dims if SKU and qty provided (single-SKU orders)
    if (sku && qty != null && qty > 0) {
      this.repository.saveSkuQtyDims(sku, qty, length, width, height);
    }
    return { ok: true, orderId, sku, qty, length, width, height };
  }
}
