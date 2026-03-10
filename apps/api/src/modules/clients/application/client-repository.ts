import type { CreateClientInput, UpdateClientInput } from "../../../../../../packages/contracts/src/clients/contracts.ts";
import type { ClientRecord } from "../domain/client.ts";
import type { InitStoreDto } from "../../../../../../packages/contracts/src/init/contracts.ts";

export interface ClientRepository {
  listActive(): ClientRecord[];
  create(input: CreateClientInput): number;
  update(clientId: number, input: UpdateClientInput): void;
  softDelete(clientId: number): void;
  syncFromStores(stores: InitStoreDto[]): void;
}
