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
  const dir = mkdtempSync(join(tmpdir(), "prepshipv2-locations-"));
  tempDirs.push(dir);
  return dir;
}

function seedLocationDatabase(filename: string): void {
  const db = new DatabaseSync(filename);
  db.exec(`
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
  `);

  db.prepare(`
    INSERT INTO locations (name, company, city, state, postalCode, isDefault, active, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)
  `).run("Warehouse A", "PrepShip", "Gardena", "CA", "90248", Date.now(), Date.now());
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

test("locations endpoints support CRUD and default switching", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedLocationDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  });

  const listResponse = await app(authedRequest("http://127.0.0.1:4010/api/locations"));
  assert.equal(listResponse.status, 200);
  const listPayload = await listResponse.json() as Array<{ name: string; isDefault: boolean }>;
  assert.equal(listPayload[0]?.name, "Warehouse A");
  assert.equal(listPayload[0]?.isDefault, true);

  const createResponse = await app(authedRequest("http://127.0.0.1:4010/api/locations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Warehouse B", city: "Torrance", state: "CA", postalCode: "90501", isDefault: true }),
  }));
  assert.equal(createResponse.status, 200);
  const created = await createResponse.json() as { locationId: number };

  const afterCreateResponse = await app(authedRequest("http://127.0.0.1:4010/api/locations"));
  const afterCreatePayload = await afterCreateResponse.json() as Array<{ name: string; isDefault: boolean }>;
  assert.equal(afterCreatePayload[0]?.name, "Warehouse B");
  assert.equal(afterCreatePayload[0]?.isDefault, true);

  const updateResponse = await app(authedRequest(`http://127.0.0.1:4010/api/locations/${created.locationId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Warehouse B2", city: "Torrance", state: "CA", postalCode: "90501", isDefault: false }),
  }));
  assert.equal(updateResponse.status, 200);

  const setDefaultResponse = await app(authedRequest("http://127.0.0.1:4010/api/locations/1/setDefault", {
    method: "POST",
  }));
  assert.equal(setDefaultResponse.status, 200);
  const setDefaultPayload = await setDefaultResponse.json() as { shipFrom: { name: string } | null };
  assert.equal(setDefaultPayload.shipFrom?.name, "Warehouse A");

  const deleteResponse = await app(authedRequest(`http://127.0.0.1:4010/api/locations/${created.locationId}`, {
    method: "DELETE",
  }));
  assert.equal(deleteResponse.status, 200);

  const finalResponse = await app(authedRequest("http://127.0.0.1:4010/api/locations"));
  const finalPayload = await finalResponse.json() as Array<{ name: string }>;
  assert.equal(finalPayload.some((location) => location.name === "Warehouse B2"), false);
});
