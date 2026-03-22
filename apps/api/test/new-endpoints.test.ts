/**
 * Tests for the three new V2 endpoints:
 * 1. GET /api/manifests/generate  (query-param variant)
 * 2. POST /api/labels/create-batch
 * 3. GET /api/orders/export
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { bootstrapApi } from "../src/app/bootstrap.ts";
import { authedRequest } from "./test-helpers.ts";
import type {
  CreateExternalLabelInput,
  CreatedExternalLabel,
  ExternalOrderShipmentRecord,
  MarkOrderShippedInput,
  ReturnLabelResult,
  ShipmentPageResult,
  ShippingGateway,
  ShipstationLabelRecord,
  ShipstationShipmentDetails,
  ShipstationV1Credentials,
} from "../src/modules/labels/application/shipping-gateway.ts";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prepshipv2-new-ep-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

// ─── Shared DB seed helpers ────────────────────────────────────────────────

function createBaseSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT);

    CREATE TABLE clients (
      clientId INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      storeIds TEXT DEFAULT '[]',
      ss_api_key TEXT,
      ss_api_secret TEXT,
      ss_api_key_v2 TEXT,
      rate_source_client_id INTEGER,
      active INTEGER DEFAULT 1
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
      shipToCity TEXT,
      shipToState TEXT,
      shipToPostalCode TEXT,
      carrierCode TEXT,
      serviceCode TEXT,
      weightValue REAL,
      orderTotal REAL,
      shippingAmount REAL,
      items TEXT,
      raw TEXT,
      updatedAt INTEGER
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
      tracking_number TEXT,
      shipping_account INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE shipments (
      shipmentId INTEGER PRIMARY KEY,
      orderId INTEGER,
      orderNumber TEXT,
      carrierCode TEXT,
      serviceCode TEXT,
      trackingNumber TEXT,
      shipDate TEXT,
      labelUrl TEXT,
      shipmentCost REAL,
      otherCost REAL DEFAULT 0,
      voided INTEGER DEFAULT 0,
      updatedAt INTEGER,
      weight_oz REAL,
      dims_l REAL,
      dims_w REAL,
      dims_h REAL,
      createDate TEXT,
      clientId INTEGER,
      providerAccountId INTEGER,
      source TEXT,
      label_created_at INTEGER,
      label_format TEXT,
      selected_rate_json TEXT
    );

    CREATE TABLE packages (
      packageId INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'box',
      length REAL DEFAULT 0,
      width REAL DEFAULT 0,
      height REAL DEFAULT 0,
      tare_weight_oz REAL DEFAULT 0,
      source TEXT DEFAULT 'custom',
      carrier_code TEXT,
      service_codes TEXT,
      active INTEGER DEFAULT 1,
      stockQty INTEGER DEFAULT 0,
      reorderLevel INTEGER DEFAULT 0
    );

    CREATE TABLE package_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      packageId INTEGER,
      delta INTEGER,
      note TEXT,
      createdAt INTEGER
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

    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE rate_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wt INTEGER, zipTo TEXT, carrier TEXT, service TEXT,
      cost REAL, source TEXT, createdAt INTEGER
    );
    CREATE TABLE order_shipments_return (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipmentId INTEGER, returnShipmentId INTEGER,
      returnTrackingNumber TEXT, reason TEXT, createdAt INTEGER
    );

    CREATE TABLE inventory_skus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      packageId INTEGER,
      length REAL,
      width REAL,
      height REAL
    );

    CREATE TABLE return_labels (
      shipmentId INTEGER PRIMARY KEY,
      returnShipmentId INTEGER,
      returnTrackingNumber TEXT,
      reason TEXT,
      createdAt INTEGER
    );
    CREATE TABLE products (
      productId INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE, name TEXT, imageUrl TEXT
    );
    CREATE TABLE product_defaults (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT, productId INTEGER,
      serviceCode TEXT, packageCode TEXT,
      shippingProviderId INTEGER, weightOz REAL,
      length REAL, width REAL, height REAL,
      updatedAt INTEGER
    );
    CREATE TABLE inventory (
      invSkuId INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER, sku TEXT, name TEXT,
      stockQty INTEGER DEFAULT 0, reorderLevel INTEGER DEFAULT 0,
      imageUrl TEXT, weight_oz REAL, length REAL, width REAL, height REAL,
      active INTEGER DEFAULT 1, createdAt INTEGER, updatedAt INTEGER
    );
    CREATE TABLE inventory_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invSkuId INTEGER, delta INTEGER, note TEXT, createdAt INTEGER
    );
    CREATE TABLE inventory_parent_skus (
      parentId INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER, name TEXT,
      createdAt INTEGER, updatedAt INTEGER
    );
    CREATE TABLE inventory_sku_parents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invSkuId INTEGER, parentId INTEGER
    );
    CREATE TABLE billing_config (
      configId INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER UNIQUE,
      pick_pack_base_price REAL DEFAULT 2.00,
      pick_pack_max_units INTEGER DEFAULT 1,
      additional_unit_price REAL DEFAULT 0.50,
      shipping_markup REAL DEFAULT 0.00,
      storage_per_unit_per_month REAL DEFAULT 0.00
    );
    CREATE TABLE billing_ref_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wt INTEGER, zipTo TEXT, carrier TEXT, service TEXT,
      cost REAL, source TEXT, fetchedAt INTEGER
    );
  `);
}

function seedExportData(db: DatabaseSync) {
  db.prepare(`INSERT INTO clients VALUES (1, 'Acme Co', '[4001]', null, null, null, null, 1)`).run();

  db.prepare(`
    INSERT INTO orders (orderId, clientId, orderNumber, orderStatus, orderDate, storeId, weightValue, orderTotal, shippingAmount, items, raw)
    VALUES
    (201, 1, 'EXP-201', 'shipped', '2026-03-01T10:00:00Z', 4001, 16, 39.99, 7.00,
     '${JSON.stringify([{ sku: "SKU-A", name: "Thing A", quantity: 2 }])}',
     '${JSON.stringify({ orderId: 201, orderNumber: "EXP-201", orderDate: "2026-03-01T10:00:00Z", orderTotal: 39.99, shippingAmount: 7.00, carrierCode: "ups", serviceCode: "ups_ground", shipTo: { name: "Alice", city: "Los Angeles", state: "CA" }, weight: { value: 16 }, items: [{ sku: "SKU-A", name: "Thing A", quantity: 2 }], externallyFulfilled: false })}')
  `).run();

  // Non-voided shipment
  db.prepare(`
    INSERT INTO shipments (shipmentId, orderId, orderNumber, carrierCode, serviceCode,
      trackingNumber, shipDate, shipmentCost, otherCost, voided, clientId, providerAccountId, source,
      label_created_at, selected_rate_json)
    VALUES (8001, 201, 'EXP-201', 'ups', 'ups_ground', '1Z-ABC', '2026-03-01',
      9.50, 0.25, 0, 1, 99, 'prepship_v2', 1234567890,
      '${JSON.stringify({ providerAccountNickname: "UPS-Main", serviceName: "UPS Ground", serviceCode: "ups_ground", carrierCode: "ups", cost: 9.50 })}')
  `).run();

  db.prepare(`
    INSERT INTO order_local (orderId, external_shipped, best_rate_json)
    VALUES (201, 0, '${JSON.stringify({ cost: 8.00, carrier: "ups" })}')
  `).run();
}

// ─── 1. GET /api/manifests/generate (query-param variant) ─────────────────

test("GET /api/manifests/generate returns CSV with query params", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  const db = new DatabaseSync(dbPath);
  createBaseSchema(db);

  db.prepare(`INSERT INTO clients VALUES (1, 'Test Client', '[4001]', null, null, null, null, 1)`).run();
  db.prepare(`INSERT INTO orders (orderId, orderNumber, weightValue, storeId) VALUES (101, 'M-101', 16, 4001)`).run();
  db.prepare(`
    INSERT INTO shipments (shipmentId, orderId, clientId, trackingNumber, carrierCode, serviceCode,
      shipmentCost, otherCost, shipDate, weight_oz, source, voided)
    VALUES (9001, 101, 1, '1ZTRACK', 'ups', 'ups_ground', 8.50, 0.50, '2026-03-05', 16, 'prepship_v2', 0)
  `).run();

  const { app } = bootstrapApi({ SQLITE_DB_PATH: dbPath, API_PORT: "4020" });

  const res = await app(authedRequest(
    "http://localhost:4020/api/manifests/generate?startDate=2026-03-01&endDate=2026-03-31",
  ));

  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(res.headers.get("content-disposition") ?? "", /manifest_2026-03-01_2026-03-31\.csv/);

  const csv = await res.text();
  assert.match(csv, /M-101/);
  assert.match(csv, /1ZTRACK/);
  assert.match(csv, /ups_ground/);
});

test("GET /api/manifests/generate returns 400 if dates missing", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  const db = new DatabaseSync(dbPath);
  createBaseSchema(db);
  db.prepare(`INSERT INTO clients VALUES (1, 'Test', '[4001]', null, null, null, null, 1)`).run();

  const { app } = bootstrapApi({ SQLITE_DB_PATH: dbPath, API_PORT: "4021" });
  const res = await app(authedRequest("http://localhost:4021/api/manifests/generate"));
  assert.equal(res.status, 400);
});

// ─── 2. POST /api/labels/create-batch ─────────────────────────────────────

function makeMockGateway(labelCalls: Array<{ orderId: number; succeed: boolean; errMsg?: string }>): ShippingGateway {
  let callIdx = 0;

  return {
    async createLabel(input: CreateExternalLabelInput): Promise<CreatedExternalLabel> {
      const spec = labelCalls[callIdx++];
      if (!spec || !spec.succeed) {
        throw new Error(spec?.errMsg ?? "Gateway error");
      }
      return {
        shipmentId: 7000 + (spec.orderId),
        carrierCode: "ups",
        serviceCode: "ups_ground",
        trackingNumber: `TRACK-${spec.orderId}`,
        labelUrl: `https://labels.example.com/${spec.orderId}.pdf`,
        cost: 9.99,
        voided: false,
        shipDate: "2026-03-10",
        providerAccountId: 99,
        selectedRate: null,
      };
    },
    async getShipment(_creds: ShipstationV1Credentials, _id: number): Promise<ShipstationShipmentDetails | null> {
      return null;
    },
    async markOrderShipped(_creds: ShipstationV1Credentials, _input: MarkOrderShippedInput): Promise<void> {},
    async voidShipment(_apiKey: string, _id: number): Promise<void> {},
    async createReturnLabel(_apiKey: string, _id: number, _reason: string): Promise<ReturnLabelResult> {
      throw new Error("not used");
    },
    async listOrderShipments(_creds: ShipstationV1Credentials, _id: number): Promise<ExternalOrderShipmentRecord[]> {
      return [];
    },
    async listRecentLabels(_apiKey: string): Promise<ShipstationLabelRecord[]> {
      return [];
    },
    async listShipments(_creds: ShipstationV1Credentials, _query: unknown): Promise<ShipmentPageResult> {
      return { shipments: [], total: 0 };
    },
  };
}

function seedBatchLabelData(db: DatabaseSync) {
  db.prepare(`INSERT INTO clients VALUES (1, 'Batch Co', '[4001]', 'k1', 'sec1', 'v2key1', null, 1)`).run();
  db.prepare(`INSERT INTO settings (key, value) VALUES ('ss_api_key', 'fallback-key'), ('ss_api_secret', 'fallback-secret'), ('ss_api_key_v2', 'fallback-v2-key')`).run();

  const insertOrder = db.prepare(`
    INSERT INTO orders (orderId, clientId, orderNumber, orderStatus, orderDate, storeId, weightValue, orderTotal, shippingAmount, items, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const [id, num] of [[301, "B-301"], [302, "B-302"], [303, "B-303"]] as [number, string][]) {
    insertOrder.run(
      id, 1, num, "awaiting_shipment", "2026-03-10T10:00:00Z", 4001, 16, 25.00, 0,
      JSON.stringify([{ sku: "SKU-X", name: "Item X", quantity: 1 }]),
      JSON.stringify({ orderId: id, orderNumber: num, shipTo: { name: "Bob", street1: "123 Main", city: "LA", state: "CA", postalCode: "90001" }, weight: { value: 16 } }),
    );
  }
}

test("POST /api/labels/create-batch returns continue-on-error results", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  const db = new DatabaseSync(dbPath);
  createBaseSchema(db);
  seedBatchLabelData(db);

  // order 301 succeeds, 302 fails, 303 succeeds
  const gateway = makeMockGateway([
    { orderId: 301, succeed: true },
    { orderId: 302, succeed: false, errMsg: "Carrier declined" },
    { orderId: 303, succeed: true },
  ]);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4030",
    SHIPSTATION_API_KEY_V2: "test-v2-key",
    SHIPSTATION_API_KEY: "test-key",
    SHIPSTATION_API_SECRET: "test-secret",
  }, { shippingGateway: gateway });

  const res = await app(authedRequest("http://localhost:4030/api/labels/create-batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      orderIds: [301, 302, 303],
      serviceCode: "ups_ground",
      shippingProviderId: 99,
    }),
  }));

  assert.equal(res.status, 200);
  const body = await res.json() as Record<string, unknown>;

  assert.ok(Array.isArray(body.created));
  assert.ok(Array.isArray(body.failed));
  assert.deepEqual(body.summary, { total: 3, created: 2, failed: 1 });

  const created = body.created as Array<Record<string, unknown>>;
  const failed = body.failed as Array<Record<string, unknown>>;

  assert.equal(created.length, 2);
  assert.equal(failed.length, 1);
  assert.equal(failed[0]?.orderId, 302);
  assert.ok(typeof failed[0]?.error === "string");
  assert.ok(created.every((c) => c.success === true));
});

test("POST /api/labels/create-batch returns 400 for missing orderIds", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  const db = new DatabaseSync(dbPath);
  createBaseSchema(db);
  db.prepare(`INSERT INTO clients VALUES (1, 'T', '[4001]', null, null, null, null, 1)`).run();

  const { app } = bootstrapApi({ SQLITE_DB_PATH: dbPath, API_PORT: "4031" });

  const res = await app(authedRequest("http://localhost:4031/api/labels/create-batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ serviceCode: "ups_ground", shippingProviderId: 99 }),
  }));
  assert.equal(res.status, 400);
  const body = await res.json() as Record<string, unknown>;
  assert.match(String(body.error), /orderIds/);
});

test("POST /api/labels/create-batch returns 400 for missing serviceCode", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  const db = new DatabaseSync(dbPath);
  createBaseSchema(db);
  db.prepare(`INSERT INTO clients VALUES (1, 'T', '[4001]', null, null, null, null, 1)`).run();

  const { app } = bootstrapApi({ SQLITE_DB_PATH: dbPath, API_PORT: "4032" });

  const res = await app(authedRequest("http://localhost:4032/api/labels/create-batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderIds: [1], shippingProviderId: 99 }),
  }));
  assert.equal(res.status, 400);
});

// ─── 3. GET /api/orders/export ─────────────────────────────────────────────

test("GET /api/orders/export returns CSV with all expected columns", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  const db = new DatabaseSync(dbPath);
  createBaseSchema(db);
  seedExportData(db);

  const { app } = bootstrapApi({ SQLITE_DB_PATH: dbPath, API_PORT: "4040" });

  const res = await app(authedRequest("http://localhost:4040/api/orders/export?orderStatus=shipped"));

  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(res.headers.get("content-disposition") ?? "", /orders-shipped-/);

  const csv = await res.text();
  const lines = csv.trim().split("\n");

  // Header row
  assert.ok(lines[0]?.includes("Order ID"));
  assert.ok(lines[0]?.includes("Order #"));
  assert.ok(lines[0]?.includes("Tracking #"));
  assert.ok(lines[0]?.includes("V1_RAW_API"));
  assert.ok(lines[0]?.includes("V2_selected_rate"));

  // Data row
  assert.ok(lines.length > 1, "Should have at least one data row");
  const dataRow = lines[1] ?? "";
  assert.ok(dataRow.includes("EXP-201"), "Should include order number");
  assert.ok(dataRow.includes("1Z-ABC"), "Should include tracking number");
  assert.ok(dataRow.includes("ups"), "Should include carrier");
});

test("GET /api/orders/export respects orderStatus=awaiting_shipment", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  const db = new DatabaseSync(dbPath);
  createBaseSchema(db);
  db.prepare(`INSERT INTO clients VALUES (1, 'Acme', '[4001]', null, null, null, null, 1)`).run();

  // One awaiting_shipment order (no shipment)
  db.prepare(`
    INSERT INTO orders (orderId, clientId, orderNumber, orderStatus, orderDate, storeId, weightValue, orderTotal, shippingAmount, items, raw)
    VALUES (501, 1, 'AW-501', 'awaiting_shipment', '2026-03-05T10:00:00Z', 4001, 10, 15.00, 0,
    '${JSON.stringify([{ sku: "SKU-Z", name: "Z", quantity: 1 }])}',
    '${JSON.stringify({ orderId: 501, orderNumber: "AW-501", orderDate: "2026-03-05T10:00:00Z", orderTotal: 15.00, shipTo: { name: "Carol", city: "Denver", state: "CO" }, items: [{ sku: "SKU-Z", name: "Z", quantity: 1 }], externallyFulfilled: false })}')
  `).run();

  const { app } = bootstrapApi({ SQLITE_DB_PATH: dbPath, API_PORT: "4041" });
  const res = await app(authedRequest("http://localhost:4041/api/orders/export?orderStatus=awaiting_shipment"));

  assert.equal(res.status, 200);
  const csv = await res.text();
  assert.ok(csv.includes("AW-501"), "Should include awaiting shipment order");
});

test("GET /api/orders/export returns empty CSV (just header) when no rows match", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  const db = new DatabaseSync(dbPath);
  createBaseSchema(db);
  db.prepare(`INSERT INTO clients VALUES (1, 'Empty', '[4001]', null, null, null, null, 1)`).run();

  const { app } = bootstrapApi({ SQLITE_DB_PATH: dbPath, API_PORT: "4042" });
  const res = await app(authedRequest("http://localhost:4042/api/orders/export?orderStatus=shipped"));

  assert.equal(res.status, 200);
  const csv = await res.text();
  // Should have a header row with no data rows
  assert.ok(csv.includes("Order ID"), "Should have header");
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 1, "Should only have the header row");
});
