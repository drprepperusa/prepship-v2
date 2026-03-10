import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { bootstrapApi } from "../src/app/bootstrap.ts";
import type { InitMetadataProvider } from "../src/modules/init/application/init-metadata-provider.ts";
import { CARRIER_ACCOUNTS_V2 } from "../src/common/prepship-config.ts";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prepshipv2-clients-"));
  tempDirs.push(dir);
  return dir;
}

function seedClientDatabase(filename: string): void {
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE clients (
      clientId INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      storeIds TEXT DEFAULT '[]',
      contactName TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      ss_api_key TEXT DEFAULT NULL,
      ss_api_secret TEXT DEFAULT NULL,
      ss_api_key_v2 TEXT DEFAULT NULL,
      rate_source_client_id INTEGER DEFAULT NULL,
      active INTEGER DEFAULT 1,
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE orders (
      orderId INTEGER PRIMARY KEY,
      clientId INTEGER,
      orderNumber TEXT,
      orderStatus TEXT,
      orderDate TEXT,
      storeId INTEGER,
      customerEmail TEXT,
      shipToName TEXT,
      shipToPostalCode TEXT,
      items TEXT,
      raw TEXT
    );

    CREATE TABLE order_local (
      orderId INTEGER PRIMARY KEY,
      external_shipped INTEGER DEFAULT 0,
      residential INTEGER,
      best_rate_json TEXT,
      best_rate_at INTEGER,
      best_rate_dims TEXT,
      selected_rate_json TEXT,
      selected_pid INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE shipments (
      shipmentId INTEGER PRIMARY KEY,
      orderId INTEGER,
      shipmentCost REAL,
      otherCost REAL DEFAULT 0,
      carrierCode TEXT,
      serviceCode TEXT,
      trackingNumber TEXT,
      shipDate TEXT,
      providerAccountId INTEGER,
      voided INTEGER DEFAULT 0,
      selected_rate_json TEXT,
      source TEXT DEFAULT 'prepship'
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
  `);

  db.prepare(`
    INSERT INTO clients (name, storeIds, contactName, email, phone, ss_api_key_v2, rate_source_client_id, active, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    "Main Client",
    JSON.stringify([4001]),
    "Alice",
    "alice@example.com",
    "111-1111",
    "v2-key",
    null,
    Date.now(),
    Date.now(),
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

class FakeInitMetadataProvider implements InitMetadataProvider {
  async listStores() {
    return [
      {
        storeId: 4001,
        storeName: "Main Client",
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
      },
      {
        storeId: 4002,
        storeName: "Main Client",
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
      },
      {
        storeId: 4010,
        storeName: "New Store Client",
        marketplaceId: 2,
        marketplaceName: "eBay",
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
      },
    ];
  }

  async listCarriers() {
    return [];
  }

  listCarrierAccounts() {
    return CARRIER_ACCOUNTS_V2;
  }

  async refreshCarriers() {
    return [];
  }
}

test("clients endpoints support list/create/update/delete and sync-stores", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedClientDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  }, {
    initMetadataProvider: new FakeInitMetadataProvider(),
  });

  const listResponse = await app(new Request("http://127.0.0.1:4010/api/clients"));
  assert.equal(listResponse.status, 200);
  const listPayload = await listResponse.json() as Array<{ name: string; hasOwnAccount: boolean; rateSourceName: string }>;
  assert.equal(listPayload[0]?.name, "Main Client");
  assert.equal(listPayload[0]?.hasOwnAccount, true);
  assert.equal(listPayload[0]?.rateSourceName, "DR PREPPER");

  const createResponse = await app(new Request("http://127.0.0.1:4010/api/clients", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "KFG", storeIds: [4002] }),
  }));
  assert.equal(createResponse.status, 200);
  const created = await createResponse.json() as { clientId: number };
  assert.equal(typeof created.clientId, "number");

  const updateResponse = await app(new Request(`http://127.0.0.1:4010/api/clients/${created.clientId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "KFG",
      storeIds: [4002],
      contactName: "Greg",
      email: "greg@example.com",
      phone: "222-2222",
      rate_source_client_id: 10,
    }),
  }));
  assert.equal(updateResponse.status, 200);

  const verifyResponse = await app(new Request("http://127.0.0.1:4010/api/clients"));
  const verifyPayload = await verifyResponse.json() as Array<{ name: string; contactName: string; rateSourceName: string }>;
  const updated = verifyPayload.find((client) => client.name === "KFG");
  assert.equal(updated?.contactName, "Greg");
  assert.equal(updated?.rateSourceName, "KFG");

  const deleteResponse = await app(new Request(`http://127.0.0.1:4010/api/clients/${created.clientId}`, {
    method: "DELETE",
  }));
  assert.equal(deleteResponse.status, 200);

  const afterDeleteResponse = await app(new Request("http://127.0.0.1:4010/api/clients"));
  const afterDeletePayload = await afterDeleteResponse.json() as Array<{ name: string }>;
  assert.equal(afterDeletePayload.some((client) => client.name === "KFG"), false);

  const syncStoresResponse = await app(new Request("http://127.0.0.1:4010/api/clients/sync-stores", {
    method: "POST",
  }));
  assert.equal(syncStoresResponse.status, 200);
  const syncStoresPayload = await syncStoresResponse.json() as { ok: boolean; clients: Array<{ name: string; storeIds: number[] }> };
  assert.equal(syncStoresPayload.ok, true);
  const mainClient = syncStoresPayload.clients.find((client) => client.name === "Main Client");
  assert.deepEqual(mainClient?.storeIds, [4001, 4002]);
  const newClient = syncStoresPayload.clients.find((client) => client.name === "New Store Client");
  assert.deepEqual(newClient?.storeIds, [4010]);
});
