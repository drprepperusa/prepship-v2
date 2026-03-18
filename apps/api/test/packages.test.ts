import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { bootstrapApi } from "../src/app/bootstrap.ts";
import type { PackageSyncGateway } from "../src/modules/packages/application/package-sync-gateway.ts";
import { authedRequest } from "./test-helpers.ts";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prepshipv2-packages-"));
  tempDirs.push(dir);
  return dir;
}

function seedPackageDatabase(filename: string): void {
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT);
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
      selected_package_id INTEGER,
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
    CREATE TABLE packages (
      packageId INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'box',
      length REAL DEFAULT 0,
      width REAL DEFAULT 0,
      height REAL DEFAULT 0,
      tareWeightOz REAL DEFAULT 0,
      source TEXT DEFAULT 'custom',
      carrierCode TEXT,
      stockQty INTEGER DEFAULT 0,
      reorderLevel INTEGER DEFAULT 10,
      unitCost REAL DEFAULT NULL,
      createdAt INTEGER,
      updatedAt INTEGER
    );
    CREATE TABLE package_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      packageId INTEGER NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT,
      unitCost REAL,
      createdAt INTEGER
    );
    CREATE TABLE inventory_skus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER NOT NULL,
      sku TEXT NOT NULL,
      packageId INTEGER,
      updatedAt INTEGER
    );
  `);

  db.prepare(`
    INSERT INTO packages (name, type, length, width, height, tareWeightOz, source, carrierCode, stockQty, reorderLevel, unitCost, createdAt, updatedAt)
    VALUES
      ('Small Box', 'box', 8, 6, 4, 2, 'custom', NULL, 5, 10, 1.25, ?, ?),
      ('Carrier Box', 'box', 10, 8, 6, 3, 'carrier', 'ups', 20, 5, NULL, ?, ?)
  `).run(Date.now(), Date.now(), Date.now(), Date.now());

  db.prepare(`
    INSERT INTO inventory_skus (clientId, sku, packageId, updatedAt)
    VALUES (?, ?, NULL, ?)
  `).run(1, "SKU-1", Date.now());
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

class FakePackageSyncGateway implements PackageSyncGateway {
  async listCarrierPackages(carrierCode: string) {
    if (carrierCode === "ups") {
      return [
        { code: "ups_letter", name: "UPS Letter", domestic: true, international: false },
        { code: "package", name: "Package", domestic: true, international: true },
      ];
    }
    if (carrierCode === "stamps_com") {
      return [
        { code: "flat_rate_envelope", name: "Flat Rate Envelope", domestic: true, international: false },
      ];
    }
    return [];
  }
}

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 1000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition");
}

test("packages endpoints support CRUD, stock operations, lookups, and sync carrier packages", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedPackageDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  }, {
    packageSyncGateway: new FakePackageSyncGateway(),
  });

  const listResponse = await app(authedRequest("http://127.0.0.1:4010/api/packages"));
  assert.equal(listResponse.status, 200);
  const listPayload = await listResponse.json() as Array<{ name: string }>;
  assert.equal(listPayload.length, 2);

  const lowStockResponse = await app(authedRequest("http://127.0.0.1:4010/api/packages/low-stock"));
  const lowStockPayload = await lowStockResponse.json() as Array<{ name: string }>;
  assert.deepEqual(lowStockPayload.map((item) => item.name), ["Small Box"]);

  const dimsResponse = await app(authedRequest("http://127.0.0.1:4010/api/packages/find-by-dims?length=8&width=6&height=4"));
  const dimsPayload = await dimsResponse.json() as { name: string } | null;
  assert.equal(dimsPayload?.name, "Small Box");

  const createResponse = await app(authedRequest("http://127.0.0.1:4010/api/packages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "New Box", length: 12, width: 10, height: 8, tareWeightOz: 4 }),
  }));
  assert.equal(createResponse.status, 200);
  const created = await createResponse.json() as { packageId: number };

  const autoCreateResponse = await app(authedRequest("http://127.0.0.1:4010/api/packages/auto-create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ length: 9, width: 7, height: 5, sku: "SKU-1", clientId: 1 }),
  }));
  assert.equal(autoCreateResponse.status, 200);
  const autoPayload = await autoCreateResponse.json() as { package: { name: string }; isNew: boolean };
  assert.equal(autoPayload.isNew, true);

  const getResponse = await app(authedRequest(`http://127.0.0.1:4010/api/packages/${created.packageId}`));
  assert.equal(getResponse.status, 200);

  const updateResponse = await app(authedRequest(`http://127.0.0.1:4010/api/packages/${created.packageId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Renamed Box", type: "box", length: 12, width: 10, height: 8, tareWeightOz: 4, reorderLevel: 3, unitCost: 2.5 }),
  }));
  assert.equal(updateResponse.status, 200);

  const receiveResponse = await app(authedRequest("http://127.0.0.1:4010/api/packages/1/receive", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ qty: 10, note: "restock", costPerUnit: 1.5 }),
  }));
  assert.equal(receiveResponse.status, 200);

  const adjustResponse = await app(authedRequest("http://127.0.0.1:4010/api/packages/1/adjust", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ qty: -2, note: "damage" }),
  }));
  assert.equal(adjustResponse.status, 200);

  const reorderResponse = await app(authedRequest("http://127.0.0.1:4010/api/packages/1/reorder-level", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reorderLevel: 4 }),
  }));
  assert.equal(reorderResponse.status, 200);

  const ledgerResponse = await app(authedRequest("http://127.0.0.1:4010/api/packages/1/ledger"));
  const ledgerPayload = await ledgerResponse.json() as Array<{ delta: number }>;
  assert.equal(ledgerPayload.length, 2);

  const deleteResponse = await app(authedRequest(`http://127.0.0.1:4010/api/packages/${created.packageId}`, {
    method: "DELETE",
  }));
  assert.equal(deleteResponse.status, 200);

  const syncResponse = await app(authedRequest("http://127.0.0.1:4010/api/packages/sync", { method: "POST" }));
  assert.equal(syncResponse.status, 200);
  assert.deepEqual(await syncResponse.json(), { queued: true });

  await waitFor(() => {
    const db = new DatabaseSync(dbPath);
    const row = db.prepare(`SELECT name, source, carrierCode FROM packages WHERE name = '[UPS] UPS Letter' LIMIT 1`).get() as
      | { name: string; source: string; carrierCode: string }
      | undefined;
    return row?.source === "carrier" && row?.carrierCode === "ups";
  });
});

test("packages endpoints reject malformed JSON and invalid dimension query input", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedPackageDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  }, {
    packageSyncGateway: new FakePackageSyncGateway(),
  });

  const invalidDimsResponse = await app(authedRequest("http://127.0.0.1:4010/api/packages/find-by-dims?length=8x&width=6&height=4"));
  assert.equal(invalidDimsResponse.status, 400);
  assert.deepEqual(await invalidDimsResponse.json(), { error: "length must be a number" });

  const malformedCreateResponse = await app(authedRequest("http://127.0.0.1:4010/api/packages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{\"name\":",
  }));
  assert.equal(malformedCreateResponse.status, 400);
  assert.deepEqual(await malformedCreateResponse.json(), { error: "Malformed JSON body" });
});
