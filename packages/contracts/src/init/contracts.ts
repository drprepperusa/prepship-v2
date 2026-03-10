export interface InitStoreDto {
  storeId: number;
  storeName: string;
  marketplaceId: number | null;
  marketplaceName: string | null;
  accountName: string | null;
  email: string | null;
  integrationUrl: string | null;
  active: boolean;
  companyName: string;
  phone: string;
  publicEmail: string;
  website: string;
  refreshDate: string | null;
  lastRefreshAttempt: string | null;
  createDate: string | null;
  modifyDate: string | null;
  autoRefresh: boolean;
  statusMappings: unknown;
  isLocal?: boolean;
}

export interface CarrierAccountDto {
  carrierId: string;
  carrierCode: string;
  shippingProviderId: number;
  nickname: string;
  clientId: number | null;
  code: string;
  _label: string;
}

export interface OrdersByStatusDto {
  orderStatus: string;
  cnt: number;
}

export interface OrdersByStatusStoreDto extends OrdersByStatusDto {
  storeId: number | null;
}

export interface InitCountsDto {
  byStatus: OrdersByStatusDto[];
  byStatusStore: OrdersByStatusStoreDto[];
}

export interface ClientDto {
  clientId: number;
  name: string;
  storeIds: number[];
  contactName: string;
  email: string;
  phone: string;
  active: boolean;
  hasOwnAccount: boolean;
  rateSourceClientId: number | null;
  rateSourceName: string;
}

export interface InitDataDto {
  stores: InitStoreDto[];
  carriers: CarrierAccountDto[];
  counts: InitCountsDto;
  markups: Record<string, unknown>;
  clients: ClientDto[];
}
