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
  const dir = mkdtempSync(join(tmpdir(), "prepshipv2-rates-"));
  tempDirs.push(dir);
  return dir;
}

function seedRatesDatabase(filename: string): void {
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE clients (
      clientId INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      storeIds TEXT DEFAULT '[]',
      ss_api_key_v2 TEXT DEFAULT NULL,
      rate_source_client_id INTEGER DEFAULT NULL,
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

    CREATE TABLE rate_cache (
      cache_key TEXT PRIMARY KEY,
      weight_oz INTEGER,
      to_zip TEXT,
      rates TEXT NOT NULL,
      best_rate TEXT,
      fetched_at INTEGER,
      weight_version INTEGER
    );

    CREATE TABLE order_local (
      orderId INTEGER PRIMARY KEY,
      ref_usps_rate REAL,
      ref_ups_rate REAL,
      rate_weight_oz REAL,
      rate_dims_l REAL,
      rate_dims_w REAL,
      rate_dims_h REAL,
      updatedAt INTEGER
    );
  `);

  db.prepare("INSERT INTO sync_meta (key, value) VALUES (?, ?)").run("weight_version", "7");
  db.prepare(`
    INSERT INTO clients (clientId, name, storeIds, ss_api_key_v2, rate_source_client_id, active)
    VALUES
      (1, 'Main Client', '[4001]', NULL, NULL, 1),
      (10, 'KFG', '[4002]', 'kfg-key', NULL, 1)
  `).run();

  const cachedRates = JSON.stringify([
    {
      serviceCode: "ups_ground",
      serviceName: "UPS Ground",
      packageType: null,
      shipmentCost: 8.25,
      otherCost: 1.1,
      rateDetails: [],
      carrierCode: "ups",
      shippingProviderId: 596001,
      carrierNickname: "ORION",
      guaranteed: false,
      zone: "5",
      sourceClientId: 1,
      deliveryDays: 4,
      estimatedDelivery: "2026-03-12",
    },
  ]);
  const bestRate = JSON.stringify({
    serviceCode: "ups_ground",
    serviceName: "UPS Ground",
    packageType: null,
    shipmentCost: 8.25,
    otherCost: 1.1,
    rateDetails: [],
    carrierCode: "ups",
    shippingProviderId: 596001,
    carrierNickname: "ORION",
    guaranteed: false,
    zone: "5",
    sourceClientId: 1,
    deliveryDays: 4,
    estimatedDelivery: "2026-03-12",
  });

  db.prepare(`
    INSERT INTO rate_cache (cache_key, weight_oz, to_zip, rates, best_rate, fetched_at, weight_version)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run("v9|16|90210|R|CL1", 16, "90210", cachedRates, bestRate, Date.now(), 7);

  db.prepare(`
    INSERT INTO rate_cache (cache_key, weight_oz, to_zip, rates, best_rate, fetched_at, weight_version)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run("v9|32|10001|12x10x8|C|CL10", 32, "10001", cachedRates, bestRate, Date.now(), 7);
}

class FakeRateShopper implements RateShopper {
  async fetchRates() {
    return [
      {
        serviceCode: "ups_ground",
        serviceName: "UPS Ground",
        packageType: null,
        shipmentCost: 9.5,
        otherCost: 0.5,
        rateDetails: [],
        carrierCode: "ups",
        shippingProviderId: 596001,
        carrierNickname: "ORION",
        guaranteed: false,
        zone: "5",
        sourceClientId: 1,
        deliveryDays: 4,
        estimatedDelivery: "2026-03-13",
      },
      {
        serviceCode: "usps_ground_advantage",
        serviceName: "USPS Ground Advantage",
        packageType: null,
        shipmentCost: 7.25,
        otherCost: 0,
        rateDetails: [],
        carrierCode: "stamps_com",
        shippingProviderId: 433542,
        carrierNickname: "USPS Chase x7439",
        guaranteed: false,
        zone: "5",
        sourceClientId: 1,
        deliveryDays: 5,
        estimatedDelivery: "2026-03-14",
      },
    ];
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

test("rates cached endpoint returns a normalized cache hit and miss", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedRatesDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const hitResponse = await app(new Request("http://127.0.0.1:4010/api/rates/cached?wt=16&zip=90210&storeId=4001"));
  assert.equal(hitResponse.status, 200);
  const hitPayload = await hitResponse.json() as {
    cached: boolean;
    rates: Array<{ shippingProviderId: number | null; carrierNickname: string | null }>;
    best: { serviceCode: string } | null;
    fetchedAt?: number;
  };
  assert.equal(hitPayload.cached, true);
  assert.equal(hitPayload.rates[0]?.shippingProviderId, 596001);
  assert.equal(hitPayload.rates[0]?.carrierNickname, "ORION");
  assert.equal(hitPayload.best?.serviceCode, "ups_ground");
  assert.equal(typeof hitPayload.fetchedAt, "number");

  const missResponse = await app(new Request("http://127.0.0.1:4010/api/rates/cached?wt=16&zip=999"));
  assert.equal(missResponse.status, 200);
  assert.deepEqual(await missResponse.json(), { cached: false, rates: [], best: null });
});

test("rates cached bulk endpoint returns cached entries and surfaces misses without live fetch", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedRatesDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const response = await app(new Request("http://127.0.0.1:4010/api/rates/cached/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([
      { key: "order-101", wt: 16, zip: "90210", storeId: 4001 },
      { key: "order-102", wt: 32, zip: "10001", dims: { length: 12, width: 10, height: 8 }, residential: false, storeId: 4002 },
      { key: "order-103", wt: 8, zip: "33101", storeId: 4001 },
    ]),
  }));

  assert.equal(response.status, 200);
  const payload = await response.json() as {
    results: Record<string, { cached: boolean; rates?: Array<{ serviceCode: string }> }>;
    missing: string[];
  };

  assert.equal(payload.results["order-101"]?.cached, true);
  assert.equal(payload.results["order-102"]?.cached, true);
  assert.equal(payload.results["order-101"]?.rates?.[0]?.serviceCode, "ups_ground");
  assert.deepEqual(payload.results["order-103"], { cached: false, best: null });
  assert.deepEqual(payload.missing, ["order-103"]);
});

test("rates carrier lookup is scoped by store client and supports live rate + browse fetches", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedRatesDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  }, {
    rateShopper: new FakeRateShopper(),
  });

  const carriersResponse = await app(new Request("http://127.0.0.1:4010/api/carriers-for-store?storeId=4002"));
  assert.equal(carriersResponse.status, 200);
  const carriersPayload = await carriersResponse.json() as { carriers: Array<{ shippingProviderId: number }> };
  assert.equal(carriersPayload.carriers.some((carrier) => carrier.shippingProviderId === 442017), false);
  assert.equal(carriersPayload.carriers.some((carrier) => carrier.shippingProviderId === 442006), true);
  assert.equal(carriersPayload.carriers.some((carrier) => carrier.shippingProviderId === 596001), true);

  const liveResponse = await app(new Request("http://127.0.0.1:4010/api/rates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toPostalCode: "90210", weight: { value: 16 } }),
  }));
  assert.equal(liveResponse.status, 200);
  const livePayload = await liveResponse.json() as Array<{ serviceCode: string }>;
  assert.equal(livePayload[0]?.serviceCode, "usps_ground_advantage");

  const browseResponse = await app(new Request("http://127.0.0.1:4010/api/rates/browse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ shippingProviderId: 596001, toPostalCode: "90210", weightOz: 16, dimensions: { length: 10, width: 8, height: 4 } }),
  }));
  assert.equal(browseResponse.status, 200);
  const browsePayload = await browseResponse.json() as { rates: Array<{ shippingProviderId: number }> };
  assert.deepEqual(browsePayload.rates.map((rate) => rate.shippingProviderId), [596001]);

  const prefetchResponse = await app(new Request("http://127.0.0.1:4010/api/rates/prefetch", {
    method: "POST",
  }));
  assert.equal(prefetchResponse.status, 200);
});
