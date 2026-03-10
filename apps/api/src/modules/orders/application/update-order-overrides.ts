import type { OrderOverrideInput } from "../../../../../../packages/contracts/src/orders/contracts.ts";
import type { OrderRepository } from "./order-repository.ts";

export class UpdateOrderOverridesService {
  private readonly repository: OrderRepository;

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
}

