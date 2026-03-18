import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { bootstrapApi } from "../src/app/bootstrap.ts";
import type { InitMetadataProvider } from "../src/modules/init/application/init-metadata-provider.ts";
import { authedRequest } from "./test-helpers.ts";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prepshipv2-inventory-"));
  tempDirs.push(dir);
  return dir;
}

function seedInventoryDatabase(filename: string): void {
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
      orderNumber TEXT,
      orderDate TEXT,
      orderStatus TEXT,
      storeId INTEGER,
      shipToName TEXT,
      carrierCode TEXT,
      serviceCode TEXT,
      items TEXT,
      raw TEXT
    );
    CREATE TABLE order_local (
      orderId INTEGER PRIMARY KEY
    );
    CREATE TABLE shipments (
      shipmentId INTEGER PRIMARY KEY,
      orderId INTEGER,
      voided INTEGER DEFAULT 0
    );
    CREATE TABLE packages (
      packageId INTEGER PRIMARY KEY AUTOINCREMENT,
      packageCode TEXT,
      name TEXT NOT NULL,
      length REAL DEFAULT 0,
      width REAL DEFAULT 0,
      height REAL DEFAULT 0
    );
    CREATE TABLE parent_skus (
      parentSkuId INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER NOT NULL,
      name TEXT NOT NULL,
      sku TEXT,
      baseUnitQty INTEGER DEFAULT 1,
      createdAt INTEGER,
      updatedAt INTEGER
    );
    CREATE TABLE products (
      sku TEXT PRIMARY KEY,
      weightOz REAL DEFAULT 0,
      length REAL DEFAULT 0,
      width REAL DEFAULT 0,
      height REAL DEFAULT 0,
      defaultPackageCode TEXT
    );
    CREATE TABLE inventory_skus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER NOT NULL,
      sku TEXT NOT NULL,
      name TEXT DEFAULT '',
      minStock INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      weightOz REAL DEFAULT 0,
      parentSkuId INTEGER,
      baseUnitQty INTEGER DEFAULT 1,
      length REAL DEFAULT 0,
      width REAL DEFAULT 0,
      height REAL DEFAULT 0,
      productLength REAL DEFAULT 0,
      productWidth REAL DEFAULT 0,
      productHeight REAL DEFAULT 0,
      packageId INTEGER,
      units_per_pack INTEGER DEFAULT 1,
      cuFtOverride REAL,
      createdAt INTEGER,
      updatedAt INTEGER
    );
    CREATE TABLE inventory_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invSkuId INTEGER NOT NULL,
      type TEXT NOT NULL,
      qty INTEGER NOT NULL,
      orderId INTEGER,
      note TEXT,
      createdBy TEXT,
      createdAt INTEGER
    );
  `);

  db.prepare(`
    INSERT INTO clients (clientId, name, storeIds, active)
    VALUES (1, 'Main Client', '[4001]', 1)
  `).run();

  db.prepare(`
    INSERT INTO packages (packageCode, name, length, width, height)
    VALUES ('PKG-1', 'Mailer', 10, 8, 4)
  `).run();

  const now = Date.now();

  db.prepare(`
    INSERT INTO parent_skus (parentSkuId, clientId, name, sku, baseUnitQty, createdAt, updatedAt)
    VALUES (1, 1, 'Bundle Parent', 'BUNDLE-1', 1, ?, ?)
  `).run(now, now);

  db.prepare(`
    INSERT INTO products (sku, weightOz, length, width, height, defaultPackageCode)
    VALUES ('SKU-AUTO', 16, 12, 9, 6, 'PKG-1')
  `).run();

  db.prepare(`
    INSERT INTO inventory_skus (
      id, clientId, sku, name, minStock, active, weightOz, parentSkuId, baseUnitQty,
      length, width, height, productLength, productWidth, productHeight, packageId, units_per_pack, cuFtOverride, createdAt, updatedAt
    )
    VALUES
      (1, 1, 'SKU-1', 'Widget', 5, 1, 10, NULL, 2, 10, 8, 6, 4, 3, 2, 1, 1, NULL, ?, ?),
      (2, 1, 'SKU-CHILD', 'Child Widget', 5, 1, 8, 1, 1, 0, 0, 0, 0, 0, 0, NULL, 1, NULL, ?, ?)
  `).run(now, now, now, now);

  db.prepare(`
    INSERT INTO inventory_ledger (invSkuId, type, qty, orderId, note, createdBy, createdAt)
    VALUES
      (1, 'receive', 4, NULL, 'initial', 'manual', ?),
      (2, 'receive', 3, NULL, 'initial child', 'manual', ?)
  `).run(now - 1000, now - 900);

  db.prepare(`
    INSERT INTO orders (orderId, orderNumber, orderDate, orderStatus, storeId, shipToName, carrierCode, serviceCode, items, raw)
    VALUES (101, 'A-101', '2026-03-08T12:00:00Z', 'awaiting_shipment', 4001, 'Alice', 'ups', 'ups_ground', '[{"sku":"SKU-1","imageUrl":"https://img.example/widget.png","quantity":1,"adjustment":false}]', ?)
  `).run(JSON.stringify({
    orderId: 101,
    orderStatus: "awaiting_shipment",
    storeId: 4001,
    items: [{ sku: "SKU-NEW", name: "New Widget", quantity: 2, adjustment: false }],
    advancedOptions: { storeId: 4001 },
  }));
}

class NoopInitMetadataProvider implements InitMetadataProvider {
  async listStores() { return []; }
  async listCarriers() { return []; }
  listCarrierAccounts() { return []; }
  async refreshCarriers() { return []; }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

test("inventory endpoints support list, stock mutations, ledger views, and alerts", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedInventoryDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  }, {
    initMetadataProvider: new NoopInitMetadataProvider(),
  });

  const listResponse = await app(authedRequest("http://127.0.0.1:4010/api/inventory?clientId=1"));
  assert.equal(listResponse.status, 200);
  const listPayload = await listResponse.json() as Array<{ sku: string; baseUnits: number; status: string; imageUrl: string | null }>;
  assert.deepEqual(listPayload.map((item) => item.sku), ["SKU-1", "SKU-CHILD"]);
  assert.equal(listPayload.find((item) => item.sku === "SKU-1")?.baseUnits, 8);
  assert.equal(listPayload.find((item) => item.sku === "SKU-1")?.imageUrl, "https://img.example/widget.png");

  const receiveResponse = await app(authedRequest("http://127.0.0.1:4010/api/inventory/receive", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: 1,
      items: [{ sku: "SKU-AUTO", name: "Auto Added", qty: 3 }],
      note: "restock",
    }),
  }));
  assert.equal(receiveResponse.status, 200);
  const receivePayload = await receiveResponse.json() as { received: Array<{ sku: string; baseUnits: number; invSkuId: number }> };
  assert.equal(receivePayload.received[0]?.sku, "SKU-AUTO");
  assert.equal(receivePayload.received[0]?.baseUnits, 3);

  const adjustResponse = await app(authedRequest("http://127.0.0.1:4010/api/inventory/adjust", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ invSkuId: 1, qty: -2, note: "damage", type: "damage" }),
  }));
  assert.equal(adjustResponse.status, 200);
  const adjustPayload = await adjustResponse.json() as { newStock: number };
  assert.equal(adjustPayload.newStock, 2);

  const updateResponse = await app(authedRequest("http://127.0.0.1:4010/api/inventory/1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Widget Updated",
      minStock: 6,
      weightOz: 11,
      length: 11,
      width: 9,
      height: 7,
      productLength: 5,
      productWidth: 4,
      productHeight: 3,
      packageId: 1,
      units_per_pack: 2,
    }),
  }));
  assert.equal(updateResponse.status, 200);

  const badUpdateResponse = await app(authedRequest("http://127.0.0.1:4010/api/inventory/1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ length: 11, width: 9, height: 0 }),
  }));
  assert.equal(badUpdateResponse.status, 400);

  const ledgerResponse = await app(authedRequest("http://127.0.0.1:4010/api/inventory/ledger?clientId=1&limit=10"));
  assert.equal(ledgerResponse.status, 200);
  const ledgerPayload = await ledgerResponse.json() as Array<{ invSkuId: number }>;
  assert.ok(ledgerPayload.length >= 3);

  const perSkuLedgerResponse = await app(authedRequest("http://127.0.0.1:4010/api/inventory/1/ledger"));
  assert.equal(perSkuLedgerResponse.status, 200);
  const perSkuLedgerPayload = await perSkuLedgerResponse.json() as Array<{ invSkuId: number }>;
  assert.equal(perSkuLedgerPayload.every((entry) => entry.invSkuId === 1), true);

  const alertsResponse = await app(authedRequest("http://127.0.0.1:4010/api/inventory/alerts?clientId=1"));
  assert.equal(alertsResponse.status, 200);
  const alertsPayload = await alertsResponse.json() as Array<{ type: string; id: number; status: string }>;
  assert.deepEqual(alertsPayload.map((alert) => ({ type: alert.type, id: alert.id, status: alert.status })), [
    { type: "sku", id: 1, status: "low" },
    { type: "sku", id: 2, status: "low" },
    { type: "parent", id: 1, status: "low" },
  ]);

  const populateResponse = await app(authedRequest("http://127.0.0.1:4010/api/inventory/populate", {
    method: "POST",
  }));
  assert.equal(populateResponse.status, 200);
  const populatePayload = await populateResponse.json() as { ok: boolean; skusRegistered: number };
  assert.equal(populatePayload.ok, true);
  assert.equal(populatePayload.skusRegistered, 1);

  const importDimsResponse = await app(authedRequest("http://127.0.0.1:4010/api/inventory/import-dims?clientId=1&overwrite=1", {
    method: "POST",
  }));
  assert.equal(importDimsResponse.status, 200);
  const importDimsPayload = await importDimsResponse.json() as { updated: number; total: number };
  assert.equal(importDimsPayload.total >= 3, true);
  assert.equal(importDimsPayload.updated >= 1, true);

  const bulkDimsResponse = await app(authedRequest("http://127.0.0.1:4010/api/inventory/bulk-update-dims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      updates: [{ invSkuId: 1, weightOz: 14, productLength: 6, productWidth: 5, productHeight: 4 }],
    }),
  }));
  assert.equal(bulkDimsResponse.status, 200);
  const bulkDimsPayload = await bulkDimsResponse.json() as { updated: number };
  assert.equal(bulkDimsPayload.updated, 1);

  const createParentResponse = await app(authedRequest("http://127.0.0.1:4010/api/parent-skus", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: 1, name: "Master Pack", sku: "MASTER-1", baseUnitQty: 4 }),
  }));
  assert.equal(createParentResponse.status, 200);
  const createParentPayload = await createParentResponse.json() as { parentSkuId: number };
  assert.equal(createParentPayload.parentSkuId > 1, true);

  const parentListResponse = await app(authedRequest("http://127.0.0.1:4010/api/parent-skus?clientId=1"));
  assert.equal(parentListResponse.status, 200);
  const parentListPayload = await parentListResponse.json() as Array<{ parentSkuId: number }>;
  assert.equal(parentListPayload.length >= 2, true);

  const setParentResponse = await app(authedRequest("http://127.0.0.1:4010/api/inventory/1/set-parent", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ parentSkuId: createParentPayload.parentSkuId, baseUnitQty: 4 }),
  }));
  assert.equal(setParentResponse.status, 200);

  const parentDetailResponse = await app(authedRequest(`http://127.0.0.1:4010/api/parent-skus?id=${createParentPayload.parentSkuId}`));
  assert.equal(parentDetailResponse.status, 200);
  const parentDetailPayload = await parentDetailResponse.json() as { children: Array<{ id: number; baseUnitQty: number }> };
  assert.deepEqual(parentDetailPayload.children.map((child) => child.id), [1]);
  assert.equal(parentDetailPayload.children[0]?.baseUnitQty, 4);

  const skuOrdersResponse = await app(authedRequest("http://127.0.0.1:4010/api/inventory/1/sku-orders?days=7"));
  assert.equal(skuOrdersResponse.status, 200);
  const skuOrdersPayload = await skuOrdersResponse.json() as { sku: string; orders: Array<{ orderId: number }> };
  assert.equal(skuOrdersPayload.sku, "SKU-1");
  assert.deepEqual(skuOrdersPayload.orders.map((order) => order.orderId), [101]);
});

test("inventory endpoints reject invalid query params and malformed JSON", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedInventoryDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const invalidImportDims = await app(authedRequest("http://127.0.0.1:4010/api/inventory/import-dims?clientId=1abc&overwrite=1", {
    method: "POST",
  }));
  assert.equal(invalidImportDims.status, 400);
  assert.deepEqual(await invalidImportDims.json(), { error: "clientId must be an integer" });

  const invalidSkuOrders = await app(authedRequest("http://127.0.0.1:4010/api/inventory/1/sku-orders?days=7days"));
  assert.equal(invalidSkuOrders.status, 400);
  assert.deepEqual(await invalidSkuOrders.json(), { error: "days must be an integer" });

  const malformedAdjust = await app(authedRequest("http://127.0.0.1:4010/api/inventory/adjust", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{\"invSkuId\":",
  }));
  assert.equal(malformedAdjust.status, 400);
  assert.deepEqual(await malformedAdjust.json(), { error: "Malformed JSON body" });
});
