import type {
  SaveProductDefaultsInput,
} from "../../../../../../packages/contracts/src/products/contracts.ts";
import type { ProductRepository } from "./product-repository.ts";

export class ProductServices {
  private readonly repository: ProductRepository;

  constructor(repository: ProductRepository) {
    this.repository = repository;
  }

  getBulk(skus: string[]) {
    return this.repository.getBulk(skus);
  }

  getBySku(sku: string) {
    return this.repository.getBySku(sku);
  }

  saveDefaults(input: SaveProductDefaultsInput) {
    if (!input.productId && !input.sku) {
      throw new Error("productId or sku required");
    }
    return this.repository.saveDefaults(input);
  }
}
