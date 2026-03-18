import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { bootstrapApi } from "../src/app/bootstrap.ts";
import type { InitMetadataProvider } from "../src/modules/init/application/init-metadata-provider.ts";
import { CARRIER_ACCOUNTS_V2 } from "../src/common/prepship-config.ts";
import { authedRequest } from "./test-helpers.ts";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prepshipv2-init-"));
  tempDirs.push(dir);
  return dir;
}

function seedInitDatabase(filename: string): void {
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE clients (
      clientId INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      storeIds TEXT DEFAULT '[]',
      active INTEGER DEFAULT 1
    );
    CREATE TABLE locations (
      locationId INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company TEXT,
      street1 TEXT,
      street2 TEXT,
      city TEXT,
      state TEXT,
      postalCode TEXT,
      country TEXT DEFAULT 'US',
      phone TEXT,
      isDefault INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      createdAt INTEGER,
      updatedAt INTEGER
    );
    CREATE TABLE orders (
      orderId INTEGER PRIMARY KEY,
      orderStatus TEXT,
      orderDate TEXT,
      storeId INTEGER,
      raw TEXT
    );
    CREATE TABLE order_local (
      orderId INTEGER PRIMARY KEY,
      external_shipped INTEGER DEFAULT 0
    );
    CREATE TABLE shipments (
      shipmentId INTEGER PRIMARY KEY,
      orderId INTEGER,
      voided INTEGER DEFAULT 0
    );
  `);

  db.prepare(`
    INSERT INTO sync_meta (key, value)
    VALUES ('setting:rbMarkups', '{"ups":1.5,"fedex":2}')
  `).run();

  db.prepare(`
    INSERT INTO clients (clientId, name, storeIds, active)
    VALUES
      (1, 'Main Client', '[4001,4003]', 1),
      (10, 'KFG', '[4002,4004]', 1)
  `).run();

  db.prepare(`
    INSERT INTO orders (orderId, orderStatus, orderDate, storeId, raw)
    VALUES
      (101, 'awaiting_shipment', '2026-03-08T12:00:00Z', 4001, '{"externallyFulfilled":false}'),
      (102, 'shipped', '2026-03-07T12:00:00Z', 4002, '{"externallyFulfilled":false}'),
      (103, 'awaiting_shipment', '2026-03-06T12:00:00Z', 4003, '{"externallyFulfilled":true}'),
      (104, 'awaiting_shipment', '2026-03-05T12:00:00Z', 4004, '{"externallyFulfilled":false}'),
      (105, 'awaiting_shipment', '2026-03-04T12:00:00Z', 376720, '{"externallyFulfilled":false}')
  `).run();

  db.prepare(`
    INSERT INTO order_local (orderId, external_shipped)
    VALUES (101, 0), (102, 0), (103, 0), (104, 1), (105, 0)
  `).run();

  db.prepare(`
    INSERT INTO shipments (shipmentId, orderId, voided)
    VALUES (501, 102, 0), (502, 105, 0)
  `).run();
}

class FakeInitMetadataProvider implements InitMetadataProvider {
  public refreshCalls = 0;

  async listStores() {
    return [
      {
        storeId: 4001,
        storeName: "Remote Main Store",
        marketplaceId: 1,
        marketplaceName: "Amazon",
        accountName: "Main",
        email: "main@example.com",
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
      },
      {
        storeId: 376720,
        storeName: "Excluded Phantom",
        marketplaceId: 2,
        marketplaceName: "Internal",
        accountName: "House",
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
      },
    ];
  }

  async listCarriers() {
    return [{ carrierCode: "ups" }, { carrierCode: "fedex" }];
  }

  listCarrierAccounts() {
    return CARRIER_ACCOUNTS_V2;
  }

  async refreshCarriers() {
    this.refreshCalls += 1;
    return [{ carrierCode: "ups" }, { carrierCode: "fedex" }, { carrierCode: "usps" }];
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

test("init endpoints merge remote and local stores, expose counts, and refresh carrier cache", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedInitDatabase(dbPath);
  const metadataProvider = new FakeInitMetadataProvider();

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  }, {
    initMetadataProvider: metadataProvider,
  });

  const initResponse = await app(authedRequest("http://127.0.0.1:4010/api/init-data"));
  assert.equal(initResponse.status, 200);
  const initPayload = await initResponse.json() as {
    stores: Array<{ storeId: number; storeName: string; isLocal?: boolean }>;
    carriers: Array<{ shippingProviderId: number }>;
    counts: { byStatus: Array<{ orderStatus: string; cnt: number }>; byStatusStore: Array<{ storeId: number; cnt: number }> };
    markups: Record<string, unknown>;
  };

  assert.deepEqual(
    initPayload.stores.map((store) => store.storeId).sort((a, b) => a - b),
    [4001, 4002, 4003, 4004],
  );
  assert.equal(initPayload.stores.find((store) => store.storeId === 4002)?.isLocal, true);
  assert.equal(initPayload.stores.find((store) => store.storeId === 4001)?.storeName, "Remote Main Store");
  assert.equal(initPayload.carriers.length, CARRIER_ACCOUNTS_V2.length);
  assert.deepEqual(initPayload.markups, { ups: 1.5, fedex: 2 });
  assert.deepEqual(initPayload.counts.byStatus, [
    { orderStatus: "awaiting_shipment", cnt: 1 },
    { orderStatus: "shipped", cnt: 1 },
  ]);
  assert.deepEqual(initPayload.counts.byStatusStore, [
    { orderStatus: "awaiting_shipment", storeId: 4001, cnt: 1 },
    { orderStatus: "shipped", storeId: 4002, cnt: 1 },
  ]);

  const storesResponse = await app(authedRequest("http://127.0.0.1:4010/api/stores"));
  assert.equal(storesResponse.status, 200);
  const storesPayload = await storesResponse.json() as Array<{ storeId: number }>;
  assert.equal(storesPayload.some((store) => store.storeId === 376720), false);

  const carriersResponse = await app(authedRequest("http://127.0.0.1:4010/api/carriers"));
  assert.equal(carriersResponse.status, 200);
  const carriersPayload = await carriersResponse.json() as Array<{ carrierCode: string }>;
  assert.deepEqual(carriersPayload.map((carrier) => carrier.carrierCode), ["ups", "fedex"]);

  const carrierAccountsResponse = await app(authedRequest("http://127.0.0.1:4010/api/carrier-accounts"));
  assert.equal(carrierAccountsResponse.status, 200);
  const carrierAccountsPayload = await carrierAccountsResponse.json() as Array<{ shippingProviderId: number }>;
  assert.equal(carrierAccountsPayload[0]?.shippingProviderId, 433542);

  const countsResponse = await app(authedRequest("http://127.0.0.1:4010/api/counts"));
  assert.equal(countsResponse.status, 200);

  const refreshResponse = await app(authedRequest("http://127.0.0.1:4010/api/cache/refresh-carriers", { method: "POST" }));
  assert.equal(refreshResponse.status, 200);
  const refreshPayload = await refreshResponse.json() as { success: boolean; carrierCount: number };
  assert.equal(refreshPayload.success, true);
  assert.equal(refreshPayload.carrierCount, 3);
  assert.equal(metadataProvider.refreshCalls, 1);
});
