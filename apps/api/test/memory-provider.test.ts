import { test } from "node:test";
import assert from "node:assert/strict";
import { bootstrapApi } from "../src/app/bootstrap.ts";
import type { InitMetadataProvider } from "../src/modules/init/application/init-metadata-provider.ts";
import { CARRIER_ACCOUNTS_V2 } from "../src/common/prepship-config.ts";
import { authedRequest } from "./test-helpers.ts";

class MemoryInitMetadataProvider implements InitMetadataProvider {
  async listStores() {
    return [{
      storeId: 4001,
      storeName: "Remote Store",
      marketplaceId: 1,
      marketplaceName: "Amazon",
      accountName: "Main",
      email: null,
      integrationUrl: null,
      active: true,
      companyName: "",
      phone: "",
      publicEmail: "",
      website: "",
      refreshDate: null,
      lastRefreshAttempt: null,
      createDate: null,
      modifyDate: null,
      autoRefresh: false,
      statusMappings: null,
    }];
  }

  async listCarriers() {
    return [{ carrierCode: "ups" }];
  }

  listCarrierAccounts() {
    return CARRIER_ACCOUNTS_V2;
  }

  async refreshCarriers() {
    return [{ carrierCode: "ups" }, { carrierCode: "fedex" }];
  }
}

test("memory provider boots the full API surface without SQLite wiring", async () => {
  const { app } = bootstrapApi({
    DB_PROVIDER: "memory",
    API_PORT: "4010",
  }, {
    initMetadataProvider: new MemoryInitMetadataProvider(),
    memorySeed: {
      analysis: {
        orderRows: [{ items: JSON.stringify([{ sku: "SKU-1", name: "Widget", quantity: 2 }]), serviceCode: "ups_ground", storeId: 4001, orderStatus: "shipped", labelCost: 10, isExternal: 0 }],
        dailySalesRows: [{ day: "2026-03-08", sku: "SKU-1", name: "Widget", qty: 2 }],
        storeClientNameMap: { 4001: "Main Client" },
        inventorySkuMap: [{ sku: "SKU-1", invSkuId: 501 }],
        clientStoreIds: { 1: [4001] },
      },
      billing: {
        clients: [{ clientId: 1, name: "Main Client" }],
        configs: [{ clientId: 1, pickPackFee: 3, additionalUnitFee: 0.75, packageCostMarkup: 0, shippingMarkupPct: 0, shippingMarkupFlat: 0, billing_mode: "label_cost", storageFeePerCuFt: 0, storageFeeMode: "cubicft", palletPricingPerMonth: 0, palletCuFt: 80 }],
        summary: [{ clientId: 1, clientName: "Main Client", pickPackTotal: 3, additionalTotal: 0, packageTotal: 0, shippingTotal: 8.5, storageTotal: 0, orderCount: 1, grandTotal: 11.5 }],
        details: [{ orderId: 101, orderNumber: "A-101", shipDate: "2026-03-08", totalQty: 2, pickpackTotal: 3, additionalTotal: 0, packageTotal: 0, shippingTotal: 8.5, actualLabelCost: 8.5, label_weight_oz: 16, label_dims_l: 10, label_dims_w: 8, label_dims_h: 6, ref_usps_rate: null, ref_ups_rate: null, packageName: "Standard Box", itemNames: "Widget", itemSkus: "SKU-1" }],
        packagePrices: {
          1: [{ packageId: 301, price: 1.25, is_custom: 1, name: "Standard Box", length: 10, width: 8, height: 6 }],
        },
      },
      clients: [{
        clientId: 1,
        name: "Main Client",
        storeIds: "[4001]",
        contactName: "Alice",
        email: "alice@example.com",
        phone: "555-1000",
        active: 1,
        ss_api_key: null,
        ss_api_secret: null,
        ss_api_key_v2: null,
        rate_source_client_id: null,
      }],
      init: {
        counts: {
          byStatus: [{ orderStatus: "awaiting_shipment", cnt: 1 }],
          byStatusStore: [{ orderStatus: "awaiting_shipment", storeId: 4001, cnt: 1 }],
        },
        markups: { ups: 1.5 },
      },
      inventory: {
        records: [{
          id: 501,
          clientId: 1,
          sku: "SKU-1",
          name: "Widget",
          minStock: 5,
          active: true,
          weightOz: 16,
          parentSkuId: null,
          baseUnitQty: 1,
          packageLength: 10,
          packageWidth: 8,
          packageHeight: 6,
          productLength: 10,
          productWidth: 8,
          productHeight: 6,
          packageId: 301,
          unitsPerPack: 1,
          cuFtOverride: null,
          clientName: "Main Client",
          packageName: "Standard Box",
          packageDimLength: 10,
          packageDimWidth: 8,
          packageDimHeight: 6,
          parentName: null,
          currentStock: 3,
          lastMovement: 111,
          imageUrl: null,
        }],
        ledger: [{
          id: 1,
          invSkuId: 501,
          type: "receive",
          qty: 3,
          orderId: null,
          note: "seed",
          createdBy: "memory",
          createdAt: 111,
          sku: "SKU-1",
          skuName: "Widget",
          clientId: 1,
          clientName: "Main Client",
        }],
      },
      locations: [{
        locationId: 201,
        name: "Main Warehouse",
        company: "PrepShip",
        street1: "123 Main",
        street2: "",
        city: "Gardena",
        state: "CA",
        postalCode: "90248",
        country: "US",
        phone: "555-2000",
        isDefault: 1,
        active: 1,
      }],
      orders: [{
        record: {
          orderId: 101,
          clientId: 1,
          orderNumber: "A-101",
          orderStatus: "awaiting_shipment",
          orderDate: "2026-03-08T12:00:00Z",
          storeId: 4001,
          customerEmail: "buyer@example.com",
          shipToName: "Buyer",
          shipToPostalCode: "90210",
          residential: true,
          sourceResidential: true,
          externalShipped: false,
          bestRateJson: JSON.stringify({ cost: 9.25 }),
          selectedRateJson: null,
          labelShipmentId: null,
          labelTracking: null,
          labelCarrier: null,
          labelService: null,
          labelProvider: null,
          labelCost: null,
          labelRawCost: null,
          labelShipDate: null,
          raw: JSON.stringify({ orderId: 101 }),
        },
        items: [{ sku: "SKU-1", name: "Widget", quantity: 2 }],
        full: { raw: { orderId: 101 }, shipments: [], local: { note: "local" } },
        clientName: "Main Client",
      }],
      packages: {
        records: [{
          packageId: 301,
          name: "Standard Box",
          type: "box",
          length: 10,
          width: 8,
          height: 6,
          tareWeightOz: 4,
          source: "memory",
          carrierCode: null,
          stockQty: 2,
          reorderLevel: 3,
          unitCost: 1.25,
        }],
        ledger: {
          301: [{ packageId: 301, qty: 2, type: "receive", note: "seed", createdAt: 111 }],
        },
      },
      rates: {
        storeClientMap: { 4001: 1 },
        weightVersion: 2,
        cache: {
          "v9|16|90210|R|CL1": {
            ratesJson: JSON.stringify([{
              serviceCode: "ups_ground",
              serviceName: "UPS Ground",
              packageType: null,
              shipmentCost: 8.5,
              otherCost: 0,
              rateDetails: [],
              carrierCode: "ups",
              shippingProviderId: 596001,
              carrierNickname: "ORION",
              guaranteed: false,
              zone: "5",
              sourceClientId: 1,
              deliveryDays: 4,
              estimatedDelivery: "2026-03-12",
            }]),
            bestRateJson: JSON.stringify({
              serviceCode: "ups_ground",
              serviceName: "UPS Ground",
              packageType: null,
              shipmentCost: 8.5,
              otherCost: 0,
              rateDetails: [],
              carrierCode: "ups",
              shippingProviderId: 596001,
              carrierNickname: "ORION",
              guaranteed: false,
              zone: "5",
              sourceClientId: 1,
              deliveryDays: 4,
              estimatedDelivery: "2026-03-12",
            }),
            weightVersion: 2,
          },
        },
      },
      settings: {
        "setting:pageSize": "50",
      },
    },
  });

  const orders = await app(authedRequest("http://127.0.0.1:4010/api/orders?page=1&pageSize=10"));
  assert.equal(orders.status, 200);

  const clients = await app(authedRequest("http://127.0.0.1:4010/api/clients"));
  assert.equal(clients.status, 200);

  const init = await app(authedRequest("http://127.0.0.1:4010/api/init-data"));
  assert.equal(init.status, 200);

  const inventory = await app(authedRequest("http://127.0.0.1:4010/api/inventory"));
  assert.equal(inventory.status, 200);

  const locations = await app(authedRequest("http://127.0.0.1:4010/api/locations"));
  assert.equal(locations.status, 200);

  const packages = await app(authedRequest("http://127.0.0.1:4010/api/packages"));
  assert.equal(packages.status, 200);

  const rates = await app(authedRequest("http://127.0.0.1:4010/api/rates/cached?wt=16&zip=90210&storeId=4001"));
  assert.equal(rates.status, 200);

  const settings = await app(authedRequest("http://127.0.0.1:4010/api/settings/pageSize"));
  assert.equal(settings.status, 200);

  const analysis = await app(authedRequest("http://127.0.0.1:4010/api/analysis/skus"));
  assert.equal(analysis.status, 200);

  const billing = await app(authedRequest("http://127.0.0.1:4010/api/billing/config"));
  assert.equal(billing.status, 200);
});
