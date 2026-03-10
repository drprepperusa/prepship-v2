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
  const dir = mkdtempSync(join(tmpdir(), "prepshipv2-billing-"));
  tempDirs.push(dir);
  return dir;
}

function seedBillingDatabase(filename: string): void {
  const db = new DatabaseSync(filename);
  db.exec(`
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

    CREATE TABLE billing_config (
      clientId INTEGER PRIMARY KEY,
      pickPackFee REAL,
      additionalUnitFee REAL,
      packageCostMarkup REAL,
      shippingMarkupPct REAL,
      shippingMarkupFlat REAL,
      billing_mode TEXT,
      storageFeePerCuFt REAL,
      storageFeeMode TEXT,
      palletPricingPerMonth REAL,
      palletCuFt REAL,
      active INTEGER DEFAULT 1,
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE billing_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER NOT NULL,
      orderId INTEGER NOT NULL,
      orderNumber TEXT NOT NULL,
      shipDate TEXT NOT NULL,
      lineType TEXT NOT NULL,
      description TEXT NOT NULL,
      qty REAL NOT NULL,
      unitCost REAL NOT NULL,
      totalCost REAL NOT NULL,
      invoiced INTEGER DEFAULT 0,
      createdAt INTEGER,
      UNIQUE(orderId, lineType, description)
    );

    CREATE TABLE order_local (
      orderId INTEGER PRIMARY KEY,
      ref_usps_rate REAL,
      ref_ups_rate REAL,
      rate_weight_oz REAL,
      rate_dims_l REAL,
      rate_dims_w REAL,
      rate_dims_h REAL,
      external_shipped INTEGER DEFAULT 0,
      updatedAt INTEGER
    );

    CREATE TABLE shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId INTEGER NOT NULL,
      shipDate TEXT,
      shipmentCost REAL,
      otherCost REAL,
      carrierCode TEXT,
      weight_oz REAL,
      dims_l REAL,
      dims_w REAL,
      dims_h REAL,
      voided INTEGER DEFAULT 0
    );

    CREATE TABLE orders (
      orderId INTEGER PRIMARY KEY,
      orderNumber TEXT NOT NULL,
      items TEXT NOT NULL,
      raw TEXT,
      orderDate TEXT,
      orderStatus TEXT,
      storeId INTEGER,
      shipToPostalCode TEXT,
      weightValue REAL
    );

    CREATE TABLE inventory_skus (
      id INTEGER PRIMARY KEY,
      clientId INTEGER,
      sku TEXT,
      packageId INTEGER,
      active INTEGER DEFAULT 1,
      productLength REAL,
      productWidth REAL,
      productHeight REAL,
      cuFtOverride REAL
    );

    CREATE TABLE inventory_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invSkuId INTEGER NOT NULL,
      qty REAL NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE packages (
      packageId INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      length REAL,
      width REAL,
      height REAL,
      source TEXT
    );

    CREATE TABLE client_package_prices (
      clientId INTEGER NOT NULL,
      packageId INTEGER NOT NULL,
      price REAL NOT NULL,
      is_custom INTEGER DEFAULT 0,
      updatedAt INTEGER,
      PRIMARY KEY (clientId, packageId)
    );

    CREATE TABLE rate_cache (
      cache_key TEXT PRIMARY KEY,
      weight_oz REAL,
      to_zip TEXT,
      rates TEXT,
      best_rate TEXT,
      fetched_at INTEGER,
      weight_version INTEGER
    );
  `);

  db.prepare(`
    INSERT INTO clients (clientId, name, storeIds, active)
    VALUES
      (1, 'Acme', '[4001]', 1),
      (2, 'Beta', '[4002]', 1),
      (3, 'Manual Orders', '[]', 1)
  `).run();

  db.prepare(`
    INSERT INTO locations (locationId, name, isDefault, active)
    VALUES (1, 'Main Warehouse', 1, 1)
  `).run();

  db.prepare(`
    INSERT INTO billing_config (
      clientId, pickPackFee, additionalUnitFee, packageCostMarkup, shippingMarkupPct, shippingMarkupFlat,
      billing_mode, storageFeePerCuFt, storageFeeMode, palletPricingPerMonth, palletCuFt, active, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(1, 4.25, 1.1, 0.5, 10, 2.5, "reference_rate", 0.12, "pallet", 25, 100, Date.now(), Date.now());

  db.prepare(`
    INSERT INTO billing_line_items
      (clientId, orderId, orderNumber, shipDate, lineType, description, qty, unitCost, totalCost, invoiced, createdAt)
    VALUES
      (1, 1001, 'A-1001', '2026-03-02', 'pickpack', 'Pick & Pack', 1, 4.25, 4.25, 0, ?),
      (1, 1001, 'A-1001', '2026-03-02', 'additional', 'Additional units (×2)', 2, 1.10, 2.20, 0, ?),
      (1, 1001, 'A-1001', '2026-03-02', 'shipping', 'Shipping label', 1, 12.50, 12.50, 0, ?),
      (1, 1001, 'A-1001', '2026-03-02', 'package', 'Box (Custom Mailer)', 1, 0.75, 0.75, 0, ?),
      (1, 0, 'STORAGE-2026-03-01-2026-03-31', '2026-03-31', 'storage', 'Storage 2026-03-01 to 2026-03-31', 1, 5.00, 5.00, 0, ?)
  `).run(Date.now(), Date.now(), Date.now(), Date.now(), Date.now());

  db.prepare(`
    INSERT INTO orders (orderId, orderNumber, items, raw, orderDate, orderStatus)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(1001, "A-1001", JSON.stringify([
    { sku: "SKU-1", name: "Widget", quantity: 2 },
    { sku: "SKU-2", name: "Gadget", quantity: 1 },
    { sku: "ADJ", name: "Adjustment", quantity: 1, adjustment: true },
  ]), JSON.stringify({ storeId: 4001, shipTo: { postalCode: "10001" } }), "2026-03-02", "shipped");

  db.prepare(`
    INSERT INTO orders (orderId, orderNumber, items, raw, orderDate, orderStatus, storeId, shipToPostalCode, weightValue)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(1002, "A-1002", JSON.stringify([
    { sku: "SKU-1", name: "Widget", quantity: 1 },
  ]), JSON.stringify({ advancedOptions: { storeId: 4001 }, shipTo: { postalCode: "10001" } }), "2026-03-03", "shipped", 4001, "10001", 16);

  db.prepare(`
    INSERT INTO orders (orderId, orderNumber, items, raw, orderDate, orderStatus, storeId, shipToPostalCode, weightValue)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(1003, "A-1003", JSON.stringify([
    { sku: "SKU-3", name: "Poster", quantity: 1 },
  ]), JSON.stringify({ advancedOptions: { storeId: 4001 }, shipTo: { postalCode: "30301" } }), "2026-03-04", "shipped", 4001, "30301", 16);

  db.prepare(`
    INSERT INTO shipments (orderId, shipDate, shipmentCost, otherCost, carrierCode, weight_oz, dims_l, dims_w, dims_h, voided)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(1001, "2026-03-02", 10.5, 1.25, "ups", 32, 12, 10, 8);

  db.prepare(`
    INSERT INTO shipments (orderId, shipDate, shipmentCost, otherCost, carrierCode, weight_oz, dims_l, dims_w, dims_h, voided)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(1002, "2026-03-03", 8, 0, "stamps_com", 16, 12, 10, 8);

  db.prepare(`
    INSERT INTO shipments (orderId, shipDate, shipmentCost, otherCost, carrierCode, weight_oz, dims_l, dims_w, dims_h, voided)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(1003, "2026-03-04", 9.5, 0.5, "ups", 16, 12, 10, 8);

  db.prepare(`
    INSERT INTO order_local (orderId, ref_usps_rate, ref_ups_rate, rate_dims_l, rate_dims_w, rate_dims_h)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(1001, 14.25, 13.75, 12, 10, 8);

  db.prepare(`
    INSERT INTO order_local (orderId, external_shipped)
    VALUES (?, ?)
  `).run(1003, 1);

  db.prepare(`
    INSERT INTO rate_cache (cache_key, weight_oz, to_zip, rates, best_rate, fetched_at, weight_version)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    "v9|16|30301|12x10x8|R|CL1",
    16,
    "30301",
    JSON.stringify([
      { serviceCode: "usps_ground_advantage", serviceName: "USPS Ground Advantage", shipmentCost: 6.25, otherCost: 0, shippingProviderId: 433542, packageType: null, carrierCode: "stamps_com", rateDetails: [] },
      { serviceCode: "ups_ground", serviceName: "UPS Ground", shipmentCost: 8.4, otherCost: 0, shippingProviderId: 433543, packageType: null, carrierCode: "ups_walleted", rateDetails: [] },
      { serviceCode: "usps_media_mail", serviceName: "Media Mail", shipmentCost: 4.2, otherCost: 0, shippingProviderId: 433542, packageType: null, carrierCode: "stamps_com", rateDetails: [] },
    ]),
    null,
    Date.now(),
    0,
  );

  db.prepare(`
    INSERT INTO packages (packageId, name, length, width, height, source)
    VALUES
      (10, 'Custom Mailer', 12, 10, 8, 'custom'),
      (11, 'Standard Box', 8, 6, 4, 'custom')
  `).run();

  db.prepare(`
    INSERT INTO inventory_skus (id, clientId, sku, packageId, active, productLength, productWidth, productHeight, cuFtOverride)
    VALUES (1, 1, 'SKU-1', 10, 1, 12, 12, 12, NULL)
  `).run();

  db.prepare(`
    INSERT INTO inventory_ledger (invSkuId, qty, createdAt)
    VALUES (1, 30, ?)
  `).run(Date.parse("2026-02-15T00:00:00Z"));

  db.prepare(`
    INSERT INTO client_package_prices (clientId, packageId, price, is_custom, updatedAt)
    VALUES
      (1, 10, 0.75, 1, ?),
      (1, 11, 0.40, 0, ?)
  `).run(Date.now(), Date.now());
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition");
}

test("billing endpoints return read-only config, summary, details, and package prices", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedBillingDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const configResponse = await app(new Request("http://127.0.0.1:4010/api/billing/config"));
  assert.equal(configResponse.status, 200);
  const configPayload = await configResponse.json() as Array<{ clientId: number; clientName: string; pickPackFee: number; billing_mode: string }>;
  assert.deepEqual(configPayload.map((row) => row.clientName), ["Acme", "Beta"]);
  assert.equal(configPayload[0]?.pickPackFee, 4.25);
  assert.equal(configPayload[0]?.billing_mode, "reference_rate");
  assert.equal(configPayload[1]?.pickPackFee, 3);

  const summaryResponse = await app(new Request("http://127.0.0.1:4010/api/billing/summary?from=2026-03-01&to=2026-03-31"));
  assert.equal(summaryResponse.status, 200);
  const summaryPayload = await summaryResponse.json() as Array<{ clientId: number; grandTotal: number; storageTotal: number; orderCount: number }>;
  assert.equal(summaryPayload[0]?.clientId, 1);
  assert.equal(summaryPayload[0]?.grandTotal, 24.7);
  assert.equal(summaryPayload[0]?.storageTotal, 5);
  assert.equal(summaryPayload[0]?.orderCount, 1);
  assert.equal(summaryPayload[1]?.clientId, 2);
  assert.equal(summaryPayload[1]?.grandTotal, 0);

  const detailsResponse = await app(new Request("http://127.0.0.1:4010/api/billing/details?from=2026-03-01&to=2026-03-31&clientId=1"));
  assert.equal(detailsResponse.status, 200);
  const detailsPayload = await detailsResponse.json() as Array<{ orderId: number; totalQty: number; actualLabelCost: number; packageName: string; itemSkus: string }>;
  assert.equal(detailsPayload[0]?.orderId, 1001);
  assert.equal(detailsPayload[0]?.totalQty, 3);
  assert.equal(detailsPayload[0]?.actualLabelCost, 11.75);
  assert.equal(detailsPayload[0]?.packageName, "Custom Mailer");
  assert.equal(detailsPayload[0]?.itemSkus, "SKU-1 | SKU-2");

  const packagePricesResponse = await app(new Request("http://127.0.0.1:4010/api/billing/package-prices?clientId=1"));
  assert.equal(packagePricesResponse.status, 200);
  const packagePricesPayload = await packagePricesResponse.json() as Array<{ packageId: number; is_custom: number }>;
  assert.deepEqual(packagePricesPayload.map((row) => row.packageId), [10, 11]);
  assert.equal(packagePricesPayload[0]?.is_custom, 1);
});

test("billing write endpoints mutate config, package prices, and generated billing rows while enforcing required params", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedBillingDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const missingSummary = await app(new Request("http://127.0.0.1:4010/api/billing/summary"));
  assert.equal(missingSummary.status, 400);

  const missingDetails = await app(new Request("http://127.0.0.1:4010/api/billing/details?from=2026-03-01&to=2026-03-31"));
  assert.equal(missingDetails.status, 400);

  const missingPackagePrices = await app(new Request("http://127.0.0.1:4010/api/billing/package-prices"));
  assert.equal(missingPackagePrices.status, 400);

  const updateConfig = await app(new Request("http://127.0.0.1:4010/api/billing/config/1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pickPackFee: 5.5, additionalUnitFee: 1.25, billing_mode: "label_cost" }),
  }));
  assert.equal(updateConfig.status, 200);
  const configAfterUpdate = await (await app(new Request("http://127.0.0.1:4010/api/billing/config"))).json() as Array<{ clientId: number; pickPackFee: number; additionalUnitFee: number; billing_mode: string }>;
  assert.equal(configAfterUpdate.find((row) => row.clientId === 1)?.pickPackFee, 5.5);
  assert.equal(configAfterUpdate.find((row) => row.clientId === 1)?.additionalUnitFee, 1.25);
  assert.equal(configAfterUpdate.find((row) => row.clientId === 1)?.billing_mode, "label_cost");

  const badGenerate = await app(new Request("http://127.0.0.1:4010/api/billing/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from: "2026-03-01" }),
  }));
  assert.equal(badGenerate.status, 400);

  const generate = await app(new Request("http://127.0.0.1:4010/api/billing/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from: "2026-03-01", to: "2026-03-31", clientId: 1 }),
  }));
  assert.equal(generate.status, 200);
  const generatePayload = await generate.json() as { ok: true; generated: number; total: number };
  assert.equal(generatePayload.ok, true);
  assert.equal(generatePayload.generated, 7);
  assert.equal(generatePayload.total, 34.75);

  const summaryAfterGenerate = await (await app(new Request("http://127.0.0.1:4010/api/billing/summary?from=2026-03-01&to=2026-03-31&clientId=1"))).json() as Array<{ grandTotal: number; storageTotal: number; orderCount: number }>;
  assert.equal(summaryAfterGenerate[0]?.grandTotal, 39.75);
  assert.equal(summaryAfterGenerate[0]?.storageTotal, 5);
  assert.equal(summaryAfterGenerate[0]?.orderCount, 2);

  const detailsAfterGenerate = await (await app(new Request("http://127.0.0.1:4010/api/billing/details?from=2026-03-01&to=2026-03-31&clientId=1"))).json() as Array<{ orderId: number; shippingTotal: number; packageTotal: number }>;
  assert.equal(detailsAfterGenerate.length, 3);
  assert.equal(detailsAfterGenerate.find((row) => row.orderId === 1002)?.shippingTotal, 8);
  assert.equal(detailsAfterGenerate.find((row) => row.orderId === 1002)?.packageTotal, 0.75);

  const updatePrices = await app(new Request("http://127.0.0.1:4010/api/billing/package-prices", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: 1, prices: [{ packageId: 11, price: 0.9 }] }),
  }));
  assert.equal(updatePrices.status, 200);
  const pricesAfterUpdate = await (await app(new Request("http://127.0.0.1:4010/api/billing/package-prices?clientId=1"))).json() as Array<{ packageId: number; price: number; is_custom: number }>;
  assert.equal(pricesAfterUpdate.find((row) => row.packageId === 11)?.price, 0.9);
  assert.equal(pricesAfterUpdate.find((row) => row.packageId === 11)?.is_custom, 1);

  const badSetDefault = await app(new Request("http://127.0.0.1:4010/api/billing/package-prices/set-default", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ packageId: 10 }),
  }));
  assert.equal(badSetDefault.status, 400);

  const setDefault = await app(new Request("http://127.0.0.1:4010/api/billing/package-prices/set-default", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ packageId: 10, price: 1.15 }),
  }));
  assert.equal(setDefault.status, 200);
  const setDefaultPayload = await setDefault.json() as { ok: true; updated: number; skipped: number };
  assert.equal(setDefaultPayload.updated, 1);
  assert.equal(setDefaultPayload.skipped, 1);

  const betaPrices = await (await app(new Request("http://127.0.0.1:4010/api/billing/package-prices?clientId=2"))).json() as Array<{ packageId: number; price: number; is_custom: number }>;
  assert.equal(betaPrices.find((row) => row.packageId === 10)?.price, 1.15);
  assert.equal(betaPrices.find((row) => row.packageId === 10)?.is_custom, 0);
});

test("billing invoice export renders HTML and billing reference-rate endpoints backfill and fetch in the background", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedBillingDatabase(dbPath);

  const rateShopper: RateShopper = {
    async fetchRates() {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return [
        {
          serviceCode: "usps_ground_advantage",
          serviceName: "USPS Ground Advantage",
          packageType: null,
          shipmentCost: 7.1,
          otherCost: 0,
          rateDetails: [],
          carrierCode: "stamps_com",
          shippingProviderId: 433542,
          carrierNickname: "USPS",
          guaranteed: false,
          zone: null,
          sourceClientId: null,
          deliveryDays: null,
          estimatedDelivery: null,
        },
        {
          serviceCode: "ups_ground",
          serviceName: "UPS Ground",
          packageType: null,
          shipmentCost: 9.2,
          otherCost: 0,
          rateDetails: [],
          carrierCode: "ups_walleted",
          shippingProviderId: 433543,
          carrierNickname: "UPS",
          guaranteed: false,
          zone: null,
          sourceClientId: null,
          deliveryDays: null,
          estimatedDelivery: null,
        },
      ];
    },
  };

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  }, { rateShopper });

  const invoiceResponse = await app(new Request("http://127.0.0.1:4010/api/billing/invoice?clientId=1&from=2026-03-01&to=2026-03-31"));
  assert.equal(invoiceResponse.status, 200);
  assert.equal(invoiceResponse.headers.get("content-type"), "text/html; charset=utf-8");
  const invoiceHtml = await invoiceResponse.text();
  assert.equal(invoiceHtml.includes("Bill To: Acme"), true);
  assert.equal(invoiceHtml.includes("A-1001"), true);
  assert.equal(invoiceHtml.includes("$24.70"), true);

  const fetchRefRatesStatus = await app(new Request("http://127.0.0.1:4010/api/billing/fetch-ref-rates/status"));
  assert.equal(fetchRefRatesStatus.status, 200);
  assert.deepEqual(await fetchRefRatesStatus.json(), {
    running: false,
    total: 0,
    done: 0,
    errors: 0,
    startedAt: null,
  });

  const backfillRefRates = await app(new Request("http://127.0.0.1:4010/api/billing/backfill-ref-rates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from: "2026-03-01", to: "2026-03-31" }),
  }));
  assert.equal(backfillRefRates.status, 200);
  const backfillPayload = await backfillRefRates.json() as { ok: true; filled: number; missing: number; total: number };
  assert.deepEqual(backfillPayload, { ok: true, filled: 1, missing: 1, total: 2 });

  const db = new DatabaseSync(dbPath);
  const backfilledOrder = db.prepare("SELECT ref_usps_rate, ref_ups_rate FROM order_local WHERE orderId = ?").get(1003) as { ref_usps_rate: number; ref_ups_rate: number } | undefined;
  assert.equal(backfilledOrder?.ref_usps_rate, 6.25);
  assert.equal(backfilledOrder?.ref_ups_rate, 8.4);

  const fetchRefRates = await app(new Request("http://127.0.0.1:4010/api/billing/fetch-ref-rates", { method: "POST" }));
  assert.equal(fetchRefRates.status, 200);
  const fetchPayload = await fetchRefRates.json() as { ok: boolean; queued: number; orders: number; message: string };
  assert.equal(fetchPayload.ok, true);
  assert.equal(fetchPayload.queued, 1);
  assert.equal(fetchPayload.orders, 1);

  const alreadyRunning = await app(new Request("http://127.0.0.1:4010/api/billing/fetch-ref-rates", { method: "POST" }));
  assert.equal(alreadyRunning.status, 200);
  const alreadyRunningPayload = await alreadyRunning.json() as { ok: boolean; message: string; status: { running: boolean } };
  assert.equal(alreadyRunningPayload.ok, false);
  assert.equal(alreadyRunningPayload.message, "Already running");
  assert.equal(alreadyRunningPayload.status.running, true);

  await waitFor(async () => {
    const response = await app(new Request("http://127.0.0.1:4010/api/billing/fetch-ref-rates/status"));
    const payload = await response.json() as { running: boolean };
    return payload.running === false;
  });

  const completedStatus = await (await app(new Request("http://127.0.0.1:4010/api/billing/fetch-ref-rates/status"))).json() as {
    running: boolean;
    total: number;
    done: number;
    errors: number;
    startedAt: number | null;
  };
  assert.equal(completedStatus.running, false);
  assert.equal(completedStatus.total, 1);
  assert.equal(completedStatus.done, 1);
  assert.equal(completedStatus.errors, 0);
  assert.equal(typeof completedStatus.startedAt, "number");

  const fetchedOrder = db.prepare("SELECT ref_usps_rate, ref_ups_rate, rate_weight_oz FROM order_local WHERE orderId = ?").get(1002) as {
    ref_usps_rate: number;
    ref_ups_rate: number;
    rate_weight_oz: number;
  } | undefined;
  assert.equal(fetchedOrder?.ref_usps_rate, 7.1);
  assert.equal(fetchedOrder?.ref_ups_rate, 9.2);
  assert.equal(fetchedOrder?.rate_weight_oz, 16);
  db.close();
});
