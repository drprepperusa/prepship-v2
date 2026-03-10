import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { bootstrapApi } from "../src/app/bootstrap.ts";
import type { RateShopper } from "../src/modules/rates/application/rate-shopper.ts";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prepshipv2-settings-"));
  tempDirs.push(dir);
  return dir;
}

function seedSettingsDatabase(filename: string): void {
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

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
      weightValue REAL,
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
      ref_usps_rate REAL,
      ref_ups_rate REAL,
      rate_weight_oz REAL,
      best_rate_json TEXT,
      best_rate_at INTEGER,
      best_rate_dims TEXT,
      selected_rate_json TEXT,
      selected_pid INTEGER,
      rate_dims_l REAL,
      rate_dims_w REAL,
      rate_dims_h REAL,
      updatedAt INTEGER
    );

    CREATE TABLE rate_cache (
      cache_key TEXT PRIMARY KEY,
      weight_oz INTEGER,
      to_zip TEXT,
      rates TEXT NOT NULL,
      best_rate TEXT,
      fetched_at INTEGER,
      weight_version INTEGER
    );

    CREATE TABLE carrier_cache (
      apiKeyHash TEXT PRIMARY KEY,
      carriers TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
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
  `);

  db.prepare("INSERT INTO sync_meta (key, value) VALUES (?, ?)").run("setting:pageSize", "50");
  db.prepare("INSERT INTO sync_meta (key, value) VALUES (?, ?)").run("weight_version", "7");
  db.prepare(`
    INSERT INTO clients (clientId, name, storeIds, ss_api_key_v2, active, createdAt, updatedAt)
    VALUES (1, 'Main Client', '[4001]', 'client-v2-key', 1, ?, ?)
  `).run(Date.now(), Date.now());
  db.prepare(`
    INSERT INTO orders (orderId, clientId, orderNumber, orderStatus, orderDate, storeId, weightValue, customerEmail, shipToName, shipToPostalCode, items, raw)
    VALUES (101, 1, 'ORD-101', 'awaiting_shipment', '2026-03-09', 4001, 16, 'buyer@example.com', 'Buyer', '90210', '[]', '{}')
  `).run();
  db.prepare(`
    INSERT INTO order_local (orderId, residential, rate_dims_l, rate_dims_w, rate_dims_h, updatedAt)
    VALUES (101, 1, 12, 10, 8, ?)
  `).run(Date.now());
  db.prepare(`
    INSERT INTO rate_cache (cache_key, weight_oz, to_zip, rates, best_rate, fetched_at, weight_version)
    VALUES ('stale-cache', 16, '90210', '[]', NULL, ?, 7)
  `).run(Date.now());
  db.prepare(`
    INSERT INTO carrier_cache (apiKeyHash, carriers, fetched_at)
    VALUES ('hash', '[]', ?)
  `).run(Date.now());
}

class FakeRateShopper implements RateShopper {
  calls = 0;

  async fetchRates() {
    this.calls += 1;
    return [{
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
    }];
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

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

test("settings endpoints support allowed keys and clear/refetch rates", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedSettingsDatabase(dbPath);
  const shopper = new FakeRateShopper();

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  }, {
    rateShopper: shopper,
  });

  const getResponse = await app(new Request("http://127.0.0.1:4010/api/settings/pageSize"));
  assert.equal(getResponse.status, 200);
  assert.equal(await getResponse.json(), 50);

  const putResponse = await app(new Request("http://127.0.0.1:4010/api/settings/rbSettings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dense: true }),
  }));
  assert.equal(putResponse.status, 200);

  const verifyResponse = await app(new Request("http://127.0.0.1:4010/api/settings/rbSettings"));
  assert.equal(verifyResponse.status, 200);
  assert.deepEqual(await verifyResponse.json(), { dense: true });

  const unknownResponse = await app(new Request("http://127.0.0.1:4010/api/settings/not-real"));
  assert.equal(unknownResponse.status, 404);

  const cacheResponse = await app(new Request("http://127.0.0.1:4010/api/cache/clear-and-refetch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope: "all" }),
  }));
  assert.equal(cacheResponse.status, 200);
  assert.deepEqual(await cacheResponse.json(), {
    ok: true,
    message: "Cache cleared successfully",
    ordersQueued: 1,
  });

  await waitFor(async () => {
    const db = new DatabaseSync(dbPath);
    const row = db.prepare(`SELECT COUNT(*) AS count FROM rate_cache`).get() as { count: number };
    return row.count === 1 && shopper.calls > 0;
  });
});
