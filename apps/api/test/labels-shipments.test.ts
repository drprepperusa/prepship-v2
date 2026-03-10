import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { bootstrapApi } from "../src/app/bootstrap.ts";
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
  const dir = mkdtempSync(join(tmpdir(), "prepshipv2-labels-"));
  tempDirs.push(dir);
  return dir;
}

function seedDatabase(filename: string): void {
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
      ss_api_key TEXT DEFAULT NULL,
      ss_api_secret TEXT DEFAULT NULL,
      ss_api_key_v2 TEXT DEFAULT NULL,
      rate_source_client_id INTEGER DEFAULT NULL,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE orders (
      orderId INTEGER PRIMARY KEY,
      clientId INTEGER,
      orderNumber TEXT,
      orderStatus TEXT,
      weightValue REAL,
      storeId INTEGER,
      shipToName TEXT,
      raw TEXT,
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

    CREATE TABLE order_local (
      orderId INTEGER PRIMARY KEY,
      selected_pid INTEGER,
      tracking_number TEXT,
      shipping_account INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE inventory_skus (
      id INTEGER PRIMARY KEY,
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

    CREATE TABLE locations (
      locationId INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      company TEXT,
      street1 TEXT,
      street2 TEXT,
      city TEXT,
      state TEXT,
      postalCode TEXT,
      country TEXT,
      phone TEXT,
      isDefault INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    );
  `);

  db.prepare(`
    INSERT INTO clients (clientId, name, storeIds, ss_api_key, ss_api_secret, ss_api_key_v2, active)
    VALUES (1, 'Main Client', '[4001]', 'client-v1-key', 'client-v1-secret', 'client-v2-key', 1)
  `).run();

  db.prepare(`
    INSERT INTO orders (orderId, clientId, orderNumber, orderStatus, weightValue, storeId, shipToName, raw, updatedAt)
    VALUES
      (101, 1, 'ORD-101', 'awaiting_shipment', 18, 4001, 'Ada Lovelace', ?, ?),
      (102, 1, 'ORD-102', 'awaiting_shipment', 24, 4001, 'Grace Hopper', ?, ?)
  `).run(
    JSON.stringify({ shipTo: { name: "Ada Lovelace", street1: "1 Main", city: "Gardena", state: "CA", postalCode: "90248", country: "US" } }),
    Date.now(),
    JSON.stringify({ shipTo: { name: "Grace Hopper", street1: "2 Main", city: "Gardena", state: "CA", postalCode: "90248", country: "US" } }),
    Date.now(),
  );

  db.prepare(`INSERT INTO order_local (orderId, selected_pid, updatedAt) VALUES (101, 50, ?), (102, 50, ?)`).
    run(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000));
  db.prepare(`INSERT INTO inventory_skus (id, packageId, length, width, height) VALUES (1, 50, 12, 10, 8)`).run();
}

class FakeShippingGateway implements ShippingGateway {
  createdLabels: CreateExternalLabelInput[] = [];
  markedShipped: MarkOrderShippedInput[] = [];
  voidedShipmentIds: number[] = [];
  returnedShipmentIds: Array<{ shipmentId: number; reason: string }> = [];
  recentLabels: ShipstationLabelRecord[] = [{ labelId: "se-9001", trackingNumber: "1Z999", labelUrl: "https://labels.example/9001.pdf" }];
  orderShipments: Record<number, ExternalOrderShipmentRecord[]> = {
    101: [
      {
        shipmentId: 9001,
        orderId: 101,
        orderNumber: "ORD-101",
        shipmentCost: 8.75,
        otherCost: 0,
        carrierCode: "ups",
        serviceCode: "ups_ground",
        trackingNumber: "1Z999",
        shipDate: "2026-03-09",
        voided: false,
        createDate: "2026-03-09T12:00:00.000Z",
        weightOz: 18,
        dimsLength: 12,
        dimsWidth: 10,
        dimsHeight: 8,
      },
    ],
  };
  shipmentsListResponse: ShipmentPageResult = {
    shipments: [
      {
        shipmentId: 9002,
        orderId: 102,
        orderNumber: "ORD-102",
        shipmentCost: 9.25,
        otherCost: 0,
        carrierCode: "ups",
        serviceCode: "ups_ground",
        trackingNumber: "1ZSYNC",
        shipDate: "2026-03-10",
        voided: false,
        createDate: "2026-03-10T08:00:00.000Z",
        weightOz: 24,
        dimsLength: 12,
        dimsWidth: 10,
        dimsHeight: 8,
      },
    ],
    page: 1,
    pages: 1,
    total: 1,
    raw: { shipments: [{ shipmentId: 9002, trackingNumber: "1ZSYNC" }], page: 1, pages: 1, total: 1 },
  };

  async createLabel(_input: CreateExternalLabelInput): Promise<CreatedExternalLabel> {
    this.createdLabels.push(_input);
    return {
      shipmentId: 9001,
      trackingNumber: "1Z999",
      labelUrl: "https://labels.example/9001.pdf",
      cost: 8.75,
      voided: false,
      carrierCode: "ups",
      serviceCode: "ups_ground",
      shipDate: "2026-03-09",
      providerAccountId: 596001,
      selectedRate: { serviceCode: "ups_ground", cost: 8.75, providerAccountId: 596001 },
    };
  }

  async getShipment(_credentials: ShipstationV1Credentials, shipmentId: number): Promise<ShipstationShipmentDetails | null> {
    return {
      shipmentId,
      orderId: shipmentId === 9001 ? 101 : 102,
      orderNumber: shipmentId === 9001 ? "ORD-101" : "ORD-102",
      trackingNumber: shipmentId === 9001 ? "1Z999" : "1ZSYNC",
      carrierCode: "ups",
      serviceCode: "ups_ground",
      shipmentCost: shipmentId === 9001 ? 8.75 : 9.25,
      otherCost: 0,
      shipDate: shipmentId === 9001 ? "2026-03-09" : "2026-03-10",
      confirmation: "delivery",
      voided: false,
      labelUrl: `https://labels.example/${shipmentId}.pdf`,
      createDate: "2026-03-09T12:00:00.000Z",
      weightOz: shipmentId === 9001 ? 18 : 24,
      dimsLength: 12,
      dimsWidth: 10,
      dimsHeight: 8,
      providerAccountId: 596001,
    };
  }

  async markOrderShipped(_credentials: ShipstationV1Credentials, input: MarkOrderShippedInput): Promise<boolean> {
    this.markedShipped.push(input);
    return true;
  }

  async voidShipment(_apiKeyV2: string, shipmentId: number): Promise<void> {
    this.voidedShipmentIds.push(shipmentId);
  }

  async createReturnLabel(_apiKeyV2: string, shipmentId: number, reason: string): Promise<ReturnLabelResult> {
    this.returnedShipmentIds.push({ shipmentId, reason });
    return { returnTrackingNumber: "1ZRET", returnShipmentId: 9901, cost: 4.25 };
  }

  async listRecentLabels(_apiKeyV2: string): Promise<ShipstationLabelRecord[]> {
    return this.recentLabels;
  }

  async listOrderShipments(_credentials: ShipstationV1Credentials, orderId: number): Promise<ExternalOrderShipmentRecord[]> {
    return this.orderShipments[orderId] ?? [];
  }

  async listShipments(_credentials: ShipstationV1Credentials, _searchParams: URLSearchParams): Promise<ShipmentPageResult> {
    return this.shipmentsListResponse;
  }

  async listShipmentsV2(_apiKeyV2: string, _page: number): Promise<Array<{ orderNumber: string | null; orderId: number | null; carrierId: string | null }>> {
    return [{ orderNumber: "ORD-102", orderId: 102, carrierId: "se-596001" }];
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

test("POST /api/labels/create persists the shipment and marks the order shipped", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);
  const gateway = new FakeShippingGateway();
  const { app } = bootstrapApi({ SQLITE_DB_PATH: dbPath, API_PORT: "4010" }, { shippingGateway: gateway });

  const response = await app(new Request("http://127.0.0.1:4010/api/labels/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: 101, serviceCode: "ups_ground", packageCode: "package", shippingProviderId: 596001, weightOz: 18 }),
  }));

  assert.equal(response.status, 200);
  const payload = await response.json() as { shipmentId: number; trackingNumber: string; orderStatus: string; labelUrl: string };
  assert.equal(payload.shipmentId, 9001);
  assert.equal(payload.trackingNumber, "1Z999");
  assert.equal(payload.orderStatus, "shipped");
  assert.equal(gateway.markedShipped.length, 1);

  const db = new DatabaseSync(dbPath);
  const shipment = db.prepare(`SELECT trackingNumber, providerAccountId, source FROM shipments WHERE shipmentId = 9001`).get() as { trackingNumber: string; providerAccountId: number; source: string };
  assert.equal(shipment.trackingNumber, "1Z999");
  assert.equal(shipment.providerAccountId, 596001);
  assert.equal(shipment.source, "shipstation");
  const order = db.prepare(`SELECT orderStatus FROM orders WHERE orderId = 101`).get() as { orderStatus: string };
  assert.equal(order.orderStatus, "shipped");
});

test("POST /api/labels/:shipmentId/void marks the shipment void and resets the order", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);
  const gateway = new FakeShippingGateway();
  const { app } = bootstrapApi({ SQLITE_DB_PATH: dbPath, API_PORT: "4010" }, { shippingGateway: gateway });
  const db = new DatabaseSync(dbPath);
  db.prepare(`
    INSERT INTO shipments (shipmentId, orderId, orderNumber, carrierCode, serviceCode, trackingNumber, shipDate, labelUrl, shipmentCost, voided, updatedAt, clientId, providerAccountId, source, label_created_at)
    VALUES (9001, 101, 'ORD-101', 'ups', 'ups_ground', '1Z999', '2026-03-09', 'https://labels.example/9001.pdf', 8.75, 0, ?, 1, 596001, 'prepship_v2', ?)
  `).run(Date.now(), Date.now());

  const response = await app(new Request("http://127.0.0.1:4010/api/labels/9001/void", { method: "POST" }));
  assert.equal(response.status, 200);
  const payload = await response.json() as { voided: boolean; refundEstimate: string };
  assert.equal(payload.voided, true);
  assert.match(payload.refundEstimate, /UPS/);
  assert.deepEqual(gateway.voidedShipmentIds, [9001]);

  const row = db.prepare(`SELECT voided FROM shipments WHERE shipmentId = 9001`).get() as { voided: number };
  assert.equal(row.voided, 1);
  const order = db.prepare(`SELECT orderStatus FROM orders WHERE orderId = 101`).get() as { orderStatus: string };
  assert.equal(order.orderStatus, "awaiting_shipment");
});

test("POST /api/labels/:shipmentId/return stores the return label record", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);
  const gateway = new FakeShippingGateway();
  const { app } = bootstrapApi({ SQLITE_DB_PATH: dbPath, API_PORT: "4010" }, { shippingGateway: gateway });
  const db = new DatabaseSync(dbPath);
  db.prepare(`
    INSERT INTO shipments (shipmentId, orderId, orderNumber, carrierCode, serviceCode, trackingNumber, shipDate, labelUrl, shipmentCost, voided, updatedAt, clientId, providerAccountId, source, label_created_at)
    VALUES (9001, 101, 'ORD-101', 'ups', 'ups_ground', '1Z999', '2026-03-09', 'https://labels.example/9001.pdf', 8.75, 0, ?, 1, 596001, 'prepship_v2', ?)
  `).run(Date.now(), Date.now());

  const response = await app(new Request("http://127.0.0.1:4010/api/labels/9001/return", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "Customer Return" }),
  }));
  assert.equal(response.status, 200);
  const payload = await response.json() as { returnTrackingNumber: string; returnShipmentId: number };
  assert.equal(payload.returnTrackingNumber, "1ZRET");
  assert.equal(payload.returnShipmentId, 9901);

  const row = db.prepare(`SELECT returnTrackingNumber, reason FROM return_labels WHERE shipmentId = 9001`).get() as { returnTrackingNumber: string; reason: string };
  assert.equal(row.returnTrackingNumber, "1ZRET");
  assert.equal(row.reason, "Customer Return");
});

test("GET /api/labels/:orderId/retrieve returns the cached or refreshed label url", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);
  const gateway = new FakeShippingGateway();
  gateway.recentLabels = [{ labelId: "se-9001", trackingNumber: "1Z999", labelUrl: "https://labels.example/fresh-9001.pdf" }];
  const { app } = bootstrapApi({ SQLITE_DB_PATH: dbPath, API_PORT: "4010" }, { shippingGateway: gateway });
  const db = new DatabaseSync(dbPath);
  db.prepare(`
    INSERT INTO shipments (shipmentId, orderId, orderNumber, carrierCode, serviceCode, trackingNumber, shipDate, labelUrl, shipmentCost, voided, updatedAt, clientId, providerAccountId, source, label_created_at)
    VALUES (9001, 101, 'ORD-101', 'ups', 'ups_ground', '1Z999', '2026-03-09', NULL, 8.75, 0, ?, 1, 596001, 'prepship_v2', ?)
  `).run(Date.now(), Date.now());

  const response = await app(new Request("http://127.0.0.1:4010/api/labels/101/retrieve?fresh=true"));
  assert.equal(response.status, 200);
  const payload = await response.json() as { labelUrl: string; trackingNumber: string };
  assert.equal(payload.labelUrl, "https://labels.example/fresh-9001.pdf");
  assert.equal(payload.trackingNumber, "1Z999");
});

test("POST /api/shipments/sync queues a sync and upserts returned shipments", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);
  const gateway = new FakeShippingGateway();
  const { app } = bootstrapApi({ SQLITE_DB_PATH: dbPath, API_PORT: "4010" }, { shippingGateway: gateway });
  const db = new DatabaseSync(dbPath);

  const response = await app(new Request("http://127.0.0.1:4010/api/shipments/sync", { method: "POST" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { queued: true });

  await waitFor(() => {
    const row = db.prepare(`SELECT trackingNumber, providerAccountId FROM shipments WHERE shipmentId = 9002`).get() as { trackingNumber?: string; providerAccountId?: number } | undefined;
    return row?.trackingNumber === "1ZSYNC" && row?.providerAccountId === 596001;
  });
});

test("GET /api/shipments/status reports count, last sync, and running state", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);
  const gateway = new FakeShippingGateway();
  const { app } = bootstrapApi({ SQLITE_DB_PATH: dbPath, API_PORT: "4010" }, { shippingGateway: gateway });
  const db = new DatabaseSync(dbPath);
  db.prepare(`
    INSERT INTO shipments (shipmentId, orderId, orderNumber, carrierCode, serviceCode, trackingNumber, shipDate, shipmentCost, voided, updatedAt, clientId, source)
    VALUES (8001, 101, 'ORD-101', 'ups', 'ups_ground', '1ZBASE', '2026-03-09', 8.50, 0, ?, 1, 'shipstation')
  `).run(Date.now());
  db.prepare(`INSERT INTO sync_meta (key, value) VALUES ('lastShipmentSync', '1710000000000')`).run();

  const response = await app(new Request("http://127.0.0.1:4010/api/shipments/status"));
  assert.equal(response.status, 200);
  const payload = await response.json() as { count: number; lastSync: number; running: boolean };
  assert.equal(payload.count, 1);
  assert.equal(payload.lastSync, 1710000000000);
  assert.equal(payload.running, false);
});

test("GET /api/sync/status and POST /api/sync/trigger expose V1-compatible sync alias payloads", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);
  const gateway = new FakeShippingGateway();
  const { app } = bootstrapApi({ SQLITE_DB_PATH: dbPath, API_PORT: "4010" }, { shippingGateway: gateway });

  const initialStatus = await app(new Request("http://127.0.0.1:4010/api/sync/status"));
  assert.equal(initialStatus.status, 200);
  assert.deepEqual(await initialStatus.json(), {
    status: "idle",
    lastSync: null,
    count: 0,
    error: null,
    page: 0,
    mode: "idle",
    ratesCached: 0,
    ratePrefetchRunning: false,
  });

  const trigger = await app(new Request("http://127.0.0.1:4010/api/sync/trigger?full=1", { method: "POST" }));
  assert.equal(trigger.status, 200);
  assert.deepEqual(await trigger.json(), { queued: true, mode: "full" });

  await waitFor(async () => {
    const response = await app(new Request("http://127.0.0.1:4010/api/sync/status"));
    const payload = await response.json() as { status: string };
    return payload.status === "done";
  });

  const finalStatus = await (await app(new Request("http://127.0.0.1:4010/api/sync/status"))).json() as {
    status: string;
    lastSync: number | null;
    count: number;
    error: string | null;
    page: number;
    mode: string;
    ratesCached: number;
    ratePrefetchRunning: boolean;
  };
  assert.equal(finalStatus.status, "done");
  assert.equal(finalStatus.mode, "full");
  assert.equal(finalStatus.count, 2);
  assert.equal(finalStatus.page, 0);
  assert.equal(typeof finalStatus.lastSync, "number");
  assert.equal(finalStatus.error, null);
  assert.equal(finalStatus.ratesCached, 0);
  assert.equal(finalStatus.ratePrefetchRunning, false);
});

test("GET /api/shipments returns the proxied upstream payload", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedDatabase(dbPath);
  const gateway = new FakeShippingGateway();
  gateway.shipmentsListResponse = {
    shipments: [],
    page: 1,
    pages: 1,
    total: 1,
    raw: { shipments: [{ shipmentId: 9002, trackingNumber: "1ZSYNC" }], page: 1, pages: 1, total: 1 },
  };
  const { app } = bootstrapApi({ SQLITE_DB_PATH: dbPath, API_PORT: "4010" }, { shippingGateway: gateway });

  const response = await app(new Request("http://127.0.0.1:4010/api/shipments?page=1&pageSize=500"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { shipments: [{ shipmentId: 9002, trackingNumber: "1ZSYNC" }], page: 1, pages: 1, total: 1 });
});
