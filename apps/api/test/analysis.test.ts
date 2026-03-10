import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { bootstrapApi } from "../src/app/bootstrap.ts";
import type { InitMetadataProvider } from "../src/modules/init/application/init-metadata-provider.ts";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prepshipv2-analysis-"));
  tempDirs.push(dir);
  return dir;
}

function seedAnalysisDatabase(filename: string): void {
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
      shipmentCost REAL,
      otherCost REAL DEFAULT 0,
      voided INTEGER DEFAULT 0
    );
    CREATE TABLE inventory_skus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER NOT NULL,
      sku TEXT NOT NULL
    );
  `);

  db.prepare(`
    INSERT INTO clients (clientId, name, storeIds, active)
    VALUES
      (1, 'Main Client', '[4001]', 1),
      (2, 'Other Client', '[4002]', 1)
  `).run();

  db.prepare(`
    INSERT INTO inventory_skus (id, clientId, sku)
    VALUES (11, 1, 'SKU-1'), (12, 2, 'SKU-2')
  `).run();

  db.prepare(`
    INSERT INTO orders (orderId, orderStatus, orderDate, storeId, serviceCode, items, raw)
    VALUES
      (101, 'shipped', '2026-03-01T10:00:00Z', 4001, 'ups_ground', '[{"sku":"SKU-1","name":"Widget","quantity":2,"adjustment":false},{"sku":"SKU-2","name":"Gadget","quantity":1,"adjustment":false}]', '{}'),
      (102, 'shipped', '2026-03-02T10:00:00Z', 4001, 'ups_next_day_air', '[{"sku":"SKU-1","name":"Widget","quantity":1,"adjustment":false}]', '{}'),
      (103, 'shipped', '2026-03-03T10:00:00Z', 4001, 'ups_ground', '[{"name":"No SKU Item","quantity":3,"adjustment":false}]', '{}'),
      (104, 'cancelled', '2026-03-04T10:00:00Z', 4001, 'ups_ground', '[{"sku":"SKU-1","name":"Widget","quantity":5,"adjustment":false}]', '{}'),
      (105, 'shipped', '2026-03-02T10:00:00Z', 4002, 'ups_ground', '[{"sku":"SKU-2","name":"Gadget","quantity":4,"adjustment":false}]', '{}'),
      (106, 'shipped', '2026-03-02T10:00:00Z', 376720, 'ups_ground', '[{"sku":"SKU-X","name":"Excluded","quantity":9,"adjustment":false}]', '{}')
  `).run();

  db.prepare(`
    INSERT INTO shipments (shipmentId, orderId, shipmentCost, otherCost, voided)
    VALUES
      (501, 101, 9, 1, 0),
      (502, 102, 20, 0, 0),
      (503, 105, 8, 0, 0),
      (504, 106, 50, 0, 0)
  `).run();
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

test("analysis endpoints return sku aggregates and daily sales series", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedAnalysisDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  }, {
    initMetadataProvider: new NoopInitMetadataProvider(),
  });

  const skuResponse = await app(new Request("http://127.0.0.1:4010/api/analysis/skus?from=2026-03-01&to=2026-03-03&clientId=1"));
  assert.equal(skuResponse.status, 200);
  const skuPayload = await skuResponse.json() as {
    skus: Array<{ sku: string; qty: number; clientName: string; invSkuId: number | null; standardShipCount: number; expeditedShipCount: number; totalShipping: number; blendedAvgShipping: number; externalOrders: number }>;
    orderCount: number;
  };

  assert.equal(skuPayload.orderCount, 3);
  assert.deepEqual(new Set(skuPayload.skus.map((item) => item.sku)), new Set(["", "SKU-1", "SKU-2"]));
  const noSku = skuPayload.skus.find((item) => item.sku === "");
  const sku1 = skuPayload.skus.find((item) => item.sku === "SKU-1");
  const sku2 = skuPayload.skus.find((item) => item.sku === "SKU-2");
  assert.equal(noSku?.qty, 3);
  assert.equal(sku1?.clientName, "Main Client");
  assert.equal(sku1?.invSkuId, 11);
  assert.equal(sku1?.standardShipCount, 1);
  assert.equal(sku1?.expeditedShipCount, 1);
  assert.equal(sku1?.totalShipping, 25);
  assert.equal(sku1?.blendedAvgShipping, 12.5);
  assert.equal(sku2?.externalOrders, 0);

  const dailyResponse = await app(new Request("http://127.0.0.1:4010/api/analysis/daily-sales?from=2026-03-01&to=2026-03-03&top=2"));
  assert.equal(dailyResponse.status, 200);
  const dailyPayload = await dailyResponse.json() as {
    topSkus: Array<{ sku: string; total: number }>;
    dates: string[];
    series: Record<string, number[]>;
  };

  assert.deepEqual(dailyPayload.topSkus.map((item) => item.sku), ["SKU-2", "SKU-1"]);
  assert.deepEqual(dailyPayload.topSkus.map((item) => item.total), [5, 3]);
  assert.deepEqual(dailyPayload.dates, ["2026-03-01", "2026-03-02", "2026-03-03"]);
  assert.deepEqual(dailyPayload.series["SKU-2"], [1, 4, 0]);
  assert.deepEqual(dailyPayload.series["SKU-1"], [2, 1, 0]);
});
