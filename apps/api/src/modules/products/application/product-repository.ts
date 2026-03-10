import type {
  ProductBulkItemDto,
  SaveProductDefaultsInput,
} from "../../../../../../packages/contracts/src/products/contracts.ts";
import type { ProductDefaultsRecord, SaveProductDefaultsRecordResult } from "../domain/product.ts";

export interface ProductRepository {
  getBulk(skus: string[]): Record<string, ProductBulkItemDto>;
  getBySku(sku: string): ProductDefaultsRecord | null;
  saveDefaults(input: SaveProductDefaultsInput): SaveProductDefaultsRecordResult;
}
