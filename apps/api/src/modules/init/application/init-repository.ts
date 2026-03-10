import type {
  InitCountsDto,
  InitStoreDto,
} from "../../../../../../../packages/contracts/src/init/contracts.ts";

export interface InitRepository {
  listLocalClientStores(): InitStoreDto[];
  getCounts(): InitCountsDto;
  getRateBrowserMarkups(): Record<string, unknown>;
}
