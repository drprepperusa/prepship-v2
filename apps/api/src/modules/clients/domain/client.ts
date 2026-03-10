export interface ClientRecord {
  clientId: number;
  name: string;
  storeIds: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  active: number;
  ss_api_key: string | null;
  ss_api_secret: string | null;
  ss_api_key_v2: string | null;
  rate_source_client_id: number | null;
}

