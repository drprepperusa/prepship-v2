import type { BillingRepository } from "../modules/billing/application/billing-repository.ts";
import type { AnalysisRepository } from "../modules/analysis/application/analysis-repository.ts";
import type { ClientRepository } from "../modules/clients/application/client-repository.ts";
import type { InitRepository } from "../modules/init/application/init-repository.ts";
import type { InventoryRepository } from "../modules/inventory/application/inventory-repository.ts";
import type { LabelRepository } from "../modules/labels/application/label-repository.ts";
import type { LocationRepository } from "../modules/locations/application/location-repository.ts";
import type { ShipFromState } from "../modules/locations/application/ship-from-state.ts";
import type { ManifestRepository } from "../modules/manifests/application/manifest-repository.ts";
import type { OrderRepository } from "../modules/orders/application/order-repository.ts";
import type { PackageRepository } from "../modules/packages/application/package-repository.ts";
import type { ProductRepository } from "../modules/products/application/product-repository.ts";
import type { RateRepository } from "../modules/rates/application/rate-repository.ts";
import type { SettingsRepository } from "../modules/settings/application/settings-repository.ts";
import type { ShipmentRepository } from "../modules/shipments/application/shipment-repository.ts";
import type { QueueRepository } from "../modules/queue/application/queue-repository.ts";

export interface ApiDataStore {
  queueRepository: QueueRepository;
  billingRepository: BillingRepository;
  analysisRepository: AnalysisRepository;
  clientRepository: ClientRepository;
  initRepository: InitRepository;
  inventoryRepository: InventoryRepository;
  labelRepository: LabelRepository;
  locationRepository: LocationRepository;
  manifestRepository: ManifestRepository;
  orderRepository: OrderRepository;
  packageRepository: PackageRepository;
  productRepository: ProductRepository;
  rateRepository: RateRepository;
  settingsRepository: SettingsRepository;
  shipmentRepository: ShipmentRepository;
  shipFromState: ShipFromState;
}
