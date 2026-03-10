import type {
  ClientDto,
  CreateClientInput,
  UpdateClientInput,
} from "../../../../../../packages/contracts/src/clients/contracts.ts";
import type { ClientRepository } from "./client-repository.ts";
import type { ClientRecord } from "../domain/client.ts";
import type { InitMetadataProvider } from "../../init/application/init-metadata-provider.ts";

function rateSourceName(rateSourceClientId: number | null): string {
  return rateSourceClientId === 10 ? "KFG" : "DR PREPPER";
}

function mapClient(record: ClientRecord): ClientDto {
  return {
    clientId: record.clientId,
    name: record.name,
    storeIds: JSON.parse(record.storeIds ?? "[]") as number[],
    contactName: record.contactName ?? "",
    email: record.email ?? "",
    phone: record.phone ?? "",
    active: record.active === 1,
    hasOwnAccount: Boolean(record.ss_api_key && record.ss_api_secret) || Boolean(record.ss_api_key_v2),
    rateSourceClientId: record.rate_source_client_id,
    rateSourceName: rateSourceName(record.rate_source_client_id),
  };
}

export class ClientServices {
  private readonly repository: ClientRepository;
  private readonly initMetadataProvider: InitMetadataProvider;

  constructor(repository: ClientRepository, initMetadataProvider: InitMetadataProvider) {
    this.repository = repository;
    this.initMetadataProvider = initMetadataProvider;
  }

  list(): ClientDto[] {
    return this.repository.listActive().map(mapClient);
  }

  create(input: CreateClientInput) {
    if (!input.name) {
      throw new Error("name is required");
    }
    return { ok: true, clientId: this.repository.create(input) };
  }

  update(clientId: number, input: UpdateClientInput) {
    this.repository.update(clientId, input);
    return { ok: true };
  }

  remove(clientId: number) {
    this.repository.softDelete(clientId);
    return { ok: true };
  }

  async syncStores() {
    const stores = await this.initMetadataProvider.listStores();
    this.repository.syncFromStores(stores);
    return {
      ok: true,
      clients: this.list(),
    };
  }
}
