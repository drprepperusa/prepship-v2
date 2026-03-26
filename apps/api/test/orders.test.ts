import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { bootstrapApi } from "../src/app/bootstrap.ts";
import { authedRequest } from "./test-helpers.ts";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prepshipv2-"));
  tempDirs.push(dir);
  return dir;
}

function seedDatabase(filename: string): void {
  const db = new DatabaseSync(filename);

  db.exec(`
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
      externally_fulfilled_verified INTEGER DEFAULT 0,
      items TEXT,
      raw TEXT,
      updatedAt INTEGER
    );

    CREATE TABLE order_local (
      orderId INTEGER PRIMARY KEY,
      external_shipped INTEGER DEFAULT 0,
      external_shipped_source TEXT,
      residential INTEGER,
      best_rate_json TEXT,
      best_rate_at INTEGER,
      best_rate_dims TEXT,
      selected_rate_json TEXT,
      selected_pid INTEGER,
      tracking_number TEXT,
      shipping_account INTEGER,
      rate_dims_l REAL,
      rate_dims_w REAL,
      rate_dims_h REAL,
      updatedAt INTEGER
    );

    CREATE TABLE shipments (
      shipmentId INTEGER PRIMARY KEY,
      orderId INTEGER,
      orderNumber TEXT,
      shipmentCost REAL,
      otherCost REAL DEFAULT 0,
      carrierCode TEXT,
      serviceCode TEXT,
      trackingNumber TEXT,
      shipDate TEXT,
      labelUrl TEXT,
      providerAccountId INTEGER,
      voided INTEGER DEFAULT 0,
      selected_rate_json TEXT,
      source TEXT DEFAULT 'prepship',
      label_created_at INTEGER,
      updatedAt INTEGER,
      weight_oz REAL,
      dims_l REAL,
      dims_w REAL,
      dims_h REAL,
      createDate TEXT,
      clientId INTEGER,
      label_format TEXT,
      provider_account_nickname TEXT
    );

    CREATE TABLE clients (
      clientId INTEGER PRIMARY KEY,
      name TEXT,
      storeIds TEXT
    );

    CREATE TABLE rate_cache (
      cache_key TEXT PRIMARY KEY,
      rates TEXT,
      best_rate TEXT,
      fetched_at INTEGER,
      weight_version INTEGER
    );

    CREATE TABLE sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
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

  const insertOrder = db.prepare(`
    INSERT INTO orders (
      orderId, clientId, orderNumber, orderStatus, orderDate, storeId,
      customerEmail, shipToName, shipToCity, shipToState, shipToPostalCode,
      carrierCode, serviceCode, weightValue, orderTotal, shippingAmount, items, raw, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertOrder.run(
    101,
    1,
    "A-101",
    "awaiting_shipment",
    "2026-03-08T12:00:00Z",
    4001,
    "alice@example.com",
    "Alice",
    "Beverly Hills",
    "CA",
    "90210",
    null,
    null,
    32,
    48.75,
    0,
    JSON.stringify([{ sku: "SKU-1", name: "Widget", quantity: 2, adjustment: false }]),
    JSON.stringify({ orderId: 101, shipTo: { residential: true }, externallyFulfilled: false }),
    Date.now(),
  );

  insertOrder.run(
    102,
    10,
    "B-102",
    "shipped",
    "2026-03-07T12:00:00Z",
    4002,
    "bob@example.com",
    "Bob",
    "New York",
    "NY",
    "10001",
    "ups",
    "ups_ground",
    16,
    24.99,
    7.25,
    JSON.stringify([{ sku: "SKU-2", name: "Gadget", quantity: 1, adjustment: false }]),
    JSON.stringify({ orderId: 102, shipTo: { residential: false }, externallyFulfilled: false }),
    Date.now(),
  );

  insertOrder.run(
    103,
    1,
    "C-103",
    "awaiting_shipment",
    "2026-03-06T12:00:00Z",
    4003,
    "cara@example.com",
    "Cara",
    "San Francisco",
    "CA",
    "94105",
    null,
    null,
    16,
    19.99,
    0,
    JSON.stringify([{ sku: "SKU-1", name: "Widget", quantity: 1, adjustment: false }]),
    JSON.stringify({ orderId: 103, shipTo: { residential: true }, externallyFulfilled: true }),
    Date.now(),
  );

  db.prepare(`
    INSERT INTO order_local (orderId, external_shipped, residential, best_rate_json, best_rate_at, best_rate_dims, selected_rate_json, selected_pid, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(101, 0, 1, JSON.stringify({ cost: 5.55 }), 1111111111, "10x8x6", null, null, 1111111111);

  db.prepare(`
    INSERT INTO clients (clientId, name, storeIds)
    VALUES (?, ?, ?), (?, ?, ?)
  `).run(1, "Main Client", JSON.stringify([4001, 4003]), 10, "KFG", JSON.stringify([4002]));

  db.prepare(`
    INSERT INTO shipments (
      shipmentId, orderId, orderNumber, shipmentCost, otherCost, carrierCode, serviceCode,
      trackingNumber, shipDate, labelUrl, providerAccountId, voided, selected_rate_json,
      source, label_created_at, updatedAt, weight_oz, dims_l, dims_w, dims_h, createDate, clientId, label_format
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    501,
    102,
    "B-102",
    7.25,
    0.75,
    "ups",
    "ups_ground",
    "1Z999",
    "2026-03-07",
    "https://labels.example/501.pdf",
    596001,
    0,
    JSON.stringify({ cost: 7.25, shippingProviderId: 596001 }),
    "prepship",
    1111111112,
    1111111112,
    16,
    12,
    9,
    5,
    "2026-03-07T12:00:00Z",
    10,
    "pdf",
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

test("GET /api/orders returns paginated orders", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const response = await app(authedRequest("http://127.0.0.1:4010/api/orders?page=1&pageSize=10"));
  assert.equal(response.status, 200);
  const payload = await response.json() as {
    orders: Array<{
      orderId: number;
      bestRate: {
        shipmentCost: number;
        otherCost: number;
        carrierCode: string | null;
        serviceCode: string | null;
      } | null;
    }>;
    page: number;
    pages: number;
    total: number;
  };

  assert.equal(payload.page, 1);
  assert.equal(payload.pages, 1);
  assert.equal(payload.total, 3);
  assert.deepEqual(payload.orders.map((order) => order.orderId), [101, 102, 103]);
  assert.equal(payload.orders[0]?.bestRate?.shipmentCost, 5.55);
  assert.equal(payload.orders[0]?.bestRate?.otherCost, 0);
  assert.equal(payload.orders[0]?.bestRate?.carrierCode, null);
  assert.equal(payload.orders[0]?.bestRate?.serviceCode, null);
});

test("GET /api/orders?orderStatus=shipped preserves shipped semantics", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const response = await app(authedRequest("http://127.0.0.1:4010/api/orders?orderStatus=shipped"));
  assert.equal(response.status, 200);
  const payload = await response.json() as {
    orders: Array<{ orderId: number; label: { trackingNumber: string | null } }>;
    page: number;
    pages: number;
    total: number;
  };

  assert.equal(payload.page, 1);
  assert.equal(payload.pages, 1);
  assert.equal(payload.total, 1);
  assert.equal(payload.orders[0]?.orderId, 102);
  assert.equal(payload.orders[0]?.label.trackingNumber, "1Z999");
});

test("GET /api/orders/:id returns enriched order details and shipped override", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const response = await app(authedRequest("http://127.0.0.1:4010/api/orders/102"));
  assert.equal(response.status, 200);
  const payload = await response.json() as {
    orderId: number;
    orderStatus: string;
    label: { trackingNumber: string | null };
    selectedRate: {
      providerAccountId: number | null;
      shippingProviderId: number | null;
      serviceCode: string | null;
      carrierCode: string | null;
      cost: number | null;
      shipmentCost: number | null;
      otherCost: number | null;
    } | null;
  };

  assert.equal(payload.orderId, 102);
  assert.equal(payload.orderStatus, "shipped");
  assert.equal(payload.label.trackingNumber, "1Z999");
  assert.equal(payload.selectedRate?.providerAccountId, 596001);
  assert.equal(payload.selectedRate?.shippingProviderId, 596001);
  assert.equal(payload.selectedRate?.serviceCode, "ups_ground");
  assert.equal(payload.selectedRate?.carrierCode, "ups");
  assert.equal(payload.selectedRate?.cost, 7.25);
  assert.equal(payload.selectedRate?.shipmentCost, 7.25);
  assert.equal(payload.selectedRate?.otherCost, 0.75);
});

test("GET /api/orders/ids matches V1 SKU and qty semantics", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const response = await app(authedRequest("http://127.0.0.1:4010/api/orders/ids?sku=SKU-1&qty=2"));
  assert.equal(response.status, 200);
  const payload = await response.json() as { ids: number[] };

  assert.deepEqual(payload.ids, [101]);
});

test("GET /api/orders/:id treats externally fulfilled orders as shipped", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const response = await app(authedRequest("http://127.0.0.1:4010/api/orders/103"));
  assert.equal(response.status, 200);
  const payload = await response.json() as { orderId: number; orderStatus: string };

  assert.equal(payload.orderId, 103);
  assert.equal(payload.orderStatus, "shipped");
});

test("GET /api/orders/:id/full returns raw order, shipments, and local state", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const response = await app(authedRequest("http://127.0.0.1:4010/api/orders/102/full"));
  assert.equal(response.status, 200);
  const payload = await response.json() as {
    raw: { orderStatus: string };
    shipments: Array<{ trackingNumber: string }>;
    local: Record<string, unknown> | null;
  };

  assert.equal(payload.raw.orderStatus, "shipped");
  assert.equal(payload.shipments.length, 1);
  assert.equal(payload.shipments[0]?.trackingNumber, "1Z999");
  assert.equal(payload.local, null);
});

test("GET /api/orders/picklist aggregates SKU totals with client mapping", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const response = await app(authedRequest("http://127.0.0.1:4010/api/orders/picklist?orderStatus=awaiting_shipment"));
  assert.equal(response.status, 200);
  const payload = await response.json() as {
    skus: Array<{
      sku: string;
      totalQty: number;
      clientName: string;
      name: string | null;
      imageUrl: string | null;
      orderCount: number;
      storeId: number | null;
    }>;
  };

  assert.deepEqual(payload.skus, [
    {
      sku: "SKU-1",
      totalQty: 2,
      clientName: "Main Client",
      name: "Widget",
      imageUrl: null,
      orderCount: 1,
      storeId: 4001,
    },
  ]);
});

test("POST order override endpoints update order_local and shipment source", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const externalResponse = await app(authedRequest("http://127.0.0.1:4010/api/orders/102/shipped-external", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ flag: 1 }),
  }));
  assert.equal(externalResponse.status, 200);

  const residentialResponse = await app(authedRequest("http://127.0.0.1:4010/api/orders/102/residential", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ residential: false }),
  }));
  assert.equal(residentialResponse.status, 200);

  const pidResponse = await app(authedRequest("http://127.0.0.1:4010/api/orders/102/selected-pid", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ selectedPid: 596001 }),
  }));
  assert.equal(pidResponse.status, 200);

  const bestRateResponse = await app(authedRequest("http://127.0.0.1:4010/api/orders/102/best-rate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      best: {
        serviceCode: "ups_ground",
        serviceName: "UPS Ground",
        packageType: null,
        shipmentCost: 9.99,
        otherCost: 0,
        rateDetails: [],
        carrierCode: "ups",
        shippingProviderId: 596001,
        carrierNickname: "ORION",
        guaranteed: false,
        zone: "5",
        sourceClientId: 1,
        deliveryDays: 3,
        estimatedDelivery: "2026-03-12",
      },
      dims: "12x9x5",
    }),
  }));
  assert.equal(bestRateResponse.status, 200);

  const verifyResponse = await app(authedRequest("http://127.0.0.1:4010/api/orders/102/full"));
  const payload = await verifyResponse.json() as {
    local: {
      external_shipped: number;
      residential: number;
      selected_pid: number;
      best_rate_json: string;
      best_rate_dims: string;
    } | null;
    shipments: Array<{ source: string }>;
  };

  assert.equal(payload.local?.external_shipped, 1);
  assert.equal(payload.local?.residential, 0);
  assert.equal(payload.local?.selected_pid, 596001);
  assert.equal(payload.local?.best_rate_dims, "12x9x5");
  assert.equal(JSON.parse(payload.local?.best_rate_json ?? "{}").carrierCode, "ups");
  assert.equal(payload.shipments[0]?.source, "external");
});

test("POST /api/orders/:id/best-rate rejects malformed rate snapshots", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const response = await app(authedRequest("http://127.0.0.1:4010/api/orders/102/best-rate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      best: {
        serviceCode: "ups_ground",
        shipmentCost: 9.99,
        otherCost: 0,
      },
    }),
  }));

  assert.equal(response.status, 400);
  assert.match(await response.text(), /best\.carrierCode is required/);
});

test("GET /api/orders/daily-stats returns the operator summary window", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const response = await app(authedRequest("http://127.0.0.1:4010/api/orders/daily-stats"));
  assert.equal(response.status, 200);
  const payload = await response.json() as {
    window: { from: string; to: string; fromLabel: string; toLabel: string };
    totalOrders: number;
    needToShip: number;
    upcomingOrders: number;
  };

  assert.equal(typeof payload.window.from, "string");
  assert.equal(typeof payload.window.to, "string");
  assert.equal(payload.window.fromLabel.endsWith("PT"), true);
  assert.equal(payload.window.toLabel.endsWith("PT"), true);
  assert.equal(Number.isFinite(payload.totalOrders), true);
  assert.equal(Number.isFinite(payload.needToShip), true);
  assert.equal(Number.isFinite(payload.upcomingOrders), true);
});

test("POST /api/orders/:id/selected-package-id aliases the selected provider override used by the V1 UI", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const response = await app(authedRequest("http://127.0.0.1:4010/api/orders/101/selected-package-id", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ packageId: 777001 }),
  }));
  assert.equal(response.status, 200);

  const verifyResponse = await app(authedRequest("http://127.0.0.1:4010/api/orders/101/full"));
  assert.equal(verifyResponse.status, 200);
  const payload = await verifyResponse.json() as { local: { selected_pid: number } | null };
  assert.equal(payload.local?.selected_pid, 777001);
});

test("orders endpoints reject malformed query params and override payload drift", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const badListResponse = await app(authedRequest("http://127.0.0.1:4010/api/orders?page=1abc"));
  assert.equal(badListResponse.status, 400);
  assert.deepEqual(await badListResponse.json(), { error: "page must be an integer" });

  const badExternalResponse = await app(authedRequest("http://127.0.0.1:4010/api/orders/102/shipped-external", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ flag: "false" }),
  }));
  assert.equal(badExternalResponse.status, 400);
  assert.deepEqual(await badExternalResponse.json(), { error: "flag must be boolean or 0/1" });

  const badPidResponse = await app(authedRequest("http://127.0.0.1:4010/api/orders/102/selected-pid", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ selectedPid: "596001" }),
  }));
  assert.equal(badPidResponse.status, 400);
  assert.deepEqual(await badPidResponse.json(), { error: "selectedPid must be an integer or null" });

  const malformedJsonResponse = await app(authedRequest("http://127.0.0.1:4010/api/orders/102/residential", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{\"residential\":",
  }));
  assert.equal(malformedJsonResponse.status, 400);
  assert.deepEqual(await malformedJsonResponse.json(), { error: "Malformed JSON body" });
});
