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

export interface CreateClientInput {
  name: string;
  storeIds?: number[];
  contactName?: string;
  email?: string;
  phone?: string;
}

export interface UpdateClientInput {
  name: string;
  storeIds?: number[];
  contactName?: string;
  email?: string;
  phone?: string;
  ss_api_key?: string | null;
  ss_api_secret?: string | null;
  ss_api_key_v2?: string | null;
  rate_source_client_id?: number | null;
}
