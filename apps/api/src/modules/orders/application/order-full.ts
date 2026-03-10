import type { OrderFullDto } from "../../../../../../packages/contracts/src/orders/contracts.ts";
import type { OrderRepository } from "./order-repository.ts";

export class OrderFullService {
  private readonly repository: OrderRepository;

  constructor(repository: OrderRepository) {
    this.repository = repository;
  }

  execute(orderId: number): OrderFullDto | null {
    const payload = this.repository.getFullById(orderId);
    if (!payload) return null;

    return {
      raw: payload.raw,
      shipments: payload.shipments,
      local: payload.local,
    };
  }
}

