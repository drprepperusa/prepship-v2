import { InMemoryShipFromState } from "../../modules/locations/application/ship-from-state.ts";
import { SqliteAnalysisRepository } from "../../modules/analysis/data/sqlite-analysis-repository.ts";
import { SqliteBillingRepository } from "../../modules/billing/data/sqlite-billing-repository.ts";
import { SqliteClientRepository } from "../../modules/clients/data/sqlite-client-repository.ts";
import { SqliteInitRepository } from "../../modules/init/data/sqlite-init-repository.ts";
import { SqliteInventoryRepository } from "../../modules/inventory/data/sqlite-inventory-repository.ts";
import { SqliteLabelRepository } from "../../modules/labels/data/sqlite-label-repository.ts";
import { SqliteLocationRepository } from "../../modules/locations/data/sqlite-location-repository.ts";
import { SqliteManifestRepository } from "../../modules/manifests/data/sqlite-manifest-repository.ts";
import { SqliteOrderRepository } from "../../modules/orders/data/sqlite-order-repository.ts";
import { SqliteSyncLogRepository } from "../../modules/orders/data/sqlite-sync-log-repository.ts";
import { SqlitePackageRepository } from "../../modules/packages/data/sqlite-package-repository.ts";
import { SqliteProductRepository } from "../../modules/products/data/sqlite-product-repository.ts";
import { SqliteRateRepository } from "../../modules/rates/data/sqlite-rate-repository.ts";
import { SqliteSettingsRepository } from "../../modules/settings/data/sqlite-settings-repository.ts";
import { SqliteShipmentRepository } from "../../modules/shipments/data/sqlite-shipment-repository.ts";
import { SqliteQueueRepository } from "../../modules/queue/data/sqlite-queue-repository.ts";
import { openSqliteDatabase } from "../../../../../packages/shared/src/sqlite/database.ts";
import { initOrderSyncLogTable } from "../../modules/orders/data/init-sync-log-table.ts";
import type { ApiDataStore } from "../datastore.ts";

export function createSqliteDataStore(sqliteDbPath: string, excludedStoreIds: number[], mainApiKeyV2: string | null): ApiDataStore {
  const db = openSqliteDatabase(sqliteDbPath);
  
  // Initialize the order_sync_log table
  initOrderSyncLogTable(db);

  return {
    db,
    queueRepository: new SqliteQueueRepository(db),
    billingRepository: new SqliteBillingRepository(db),
    analysisRepository: new SqliteAnalysisRepository(db),
    clientRepository: new SqliteClientRepository(db),
    initRepository: new SqliteInitRepository(db, excludedStoreIds),
    inventoryRepository: new SqliteInventoryRepository(db),
    labelRepository: new SqliteLabelRepository(db, mainApiKeyV2),
    locationRepository: new SqliteLocationRepository(db),
    manifestRepository: new SqliteManifestRepository(db),
    orderRepository: new SqliteOrderRepository(db, excludedStoreIds),
    syncLogRepository: new SqliteSyncLogRepository(db),
    packageRepository: new SqlitePackageRepository(db),
    productRepository: new SqliteProductRepository(db),
    rateRepository: new SqliteRateRepository(db, mainApiKeyV2),
    settingsRepository: new SqliteSettingsRepository(db),
    shipmentRepository: new SqliteShipmentRepository(db),
    shipFromState: new InMemoryShipFromState(),
  };
}
