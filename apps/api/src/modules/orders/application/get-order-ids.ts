import type {
  GetOrderIdsQuery,
  GetOrderIdsResponse,
} from "../../../../../../packages/contracts/src/orders/contracts.ts";
import type { OrderRepository } from "./order-repository.ts";

export class GetOrderIdsService {
  private readonly repository: OrderRepository;

  constructor(repository: OrderRepository) {
    this.repository = repository;
  }

  execute(query: GetOrderIdsQuery): GetOrderIdsResponse {
    return {
      ids: this.repository.findIdsBySku(query),
    };
  }
}

