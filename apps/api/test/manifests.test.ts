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
  const dir = mkdtempSync(join(tmpdir(), "prepshipv2-manifests-"));
  tempDirs.push(dir);
  return dir;
}

function seedManifestDatabase(filename: string): void {
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
      active INTEGER DEFAULT 1
    );

    CREATE TABLE orders (
      orderId INTEGER PRIMARY KEY,
      orderNumber TEXT,
      weightValue REAL,
      storeId INTEGER
    );

    CREATE TABLE shipments (
      shipmentId INTEGER PRIMARY KEY,
      orderId INTEGER,
      clientId INTEGER,
      trackingNumber TEXT,
      carrierCode TEXT,
      serviceCode TEXT,
      shipmentCost REAL,
      otherCost REAL,
      shipDate TEXT,
      weight_oz REAL,
      source TEXT
    );
  `);

  db.prepare(`INSERT INTO clients (clientId, name, storeIds, active) VALUES (1, 'Main Client', '[4001]', 1)`).run();
  db.prepare(`
    INSERT INTO orders (orderId, orderNumber, weightValue, storeId)
    VALUES
      (101, 'ORD-101', 16, 4001),
      (102, 'ORD-102', 24, 4001)
  `).run();
  db.prepare(`
    INSERT INTO shipments (shipmentId, orderId, clientId, trackingNumber, carrierCode, serviceCode, shipmentCost, otherCost, shipDate, weight_oz, source)
    VALUES
      (9001, 101, 1, '1Z999', 'ups', 'ups_ground', 8.50, 0.50, '2026-03-05', 16, 'prepship_v2'),
      (9002, 102, 1, '9400', 'stamps_com', 'usps_ground_advantage', 6.25, 0, '2026-03-06', 24, 'prepship_v2')
  `).run();
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

test("manifests export returns CSV data for shipment date ranges", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedManifestDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const response = await app(authedRequest("http://127.0.0.1:4010/api/manifests/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ startDate: "2026-03-01", endDate: "2026-03-31" }),
  }));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/csv/);
  const csv = await response.text();
  assert.match(csv, /ORD-101/);
  assert.match(csv, /ups_ground/);
  assert.match(csv, /ORD-102/);
});
