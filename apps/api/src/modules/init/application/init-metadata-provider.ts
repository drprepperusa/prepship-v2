import type { CarrierAccountDto, InitStoreDto } from "../../../../../../../packages/contracts/src/init/contracts.ts";

export interface InitMetadataProvider {
  listStores(): Promise<InitStoreDto[]>;
  listCarriers(): Promise<unknown[]>;
  listCarrierAccounts(): CarrierAccountDto[];
  refreshCarriers(): Promise<unknown[]>;
}
