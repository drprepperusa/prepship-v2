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
  const dir = mkdtempSync(join(tmpdir(), "prepshipv2-products-"));
  tempDirs.push(dir);
  return dir;
}

function seedProductDatabase(filename: string): void {
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
    CREATE TABLE packages (
      packageId INTEGER PRIMARY KEY AUTOINCREMENT,
      packageCode TEXT,
      name TEXT NOT NULL,
      type TEXT,
      length REAL DEFAULT 0,
      width REAL DEFAULT 0,
      height REAL DEFAULT 0,
      source TEXT,
      isDefault INTEGER DEFAULT 0,
      createdAt INTEGER,
      updatedAt INTEGER
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
    CREATE TABLE products (
      productId INTEGER PRIMARY KEY,
      sku TEXT NOT NULL,
      weightOz REAL DEFAULT 0,
      length REAL DEFAULT 0,
      width REAL DEFAULT 0,
      height REAL DEFAULT 0,
      defaultPackageCode TEXT,
      modifyDate INTEGER,
      updatedAt INTEGER,
      createdAt INTEGER
    );
    CREATE TABLE sku_defaults (
      sku TEXT PRIMARY KEY,
      weightOz REAL DEFAULT 0,
      length REAL DEFAULT 0,
      width REAL DEFAULT 0,
      height REAL DEFAULT 0,
      packageCode TEXT,
      updatedAt INTEGER
    );
  `);

  const now = Date.now();
  db.prepare(`
    INSERT INTO clients (clientId, name, storeIds, active)
    VALUES (1, 'Main Client', '[4001]', 1)
  `).run();
  db.prepare(`
    INSERT INTO packages (packageId, packageCode, name, type, length, width, height, source, isDefault, createdAt, updatedAt)
    VALUES
      (1, 'PKG-1', 'Mailer', 'box', 12, 9, 6, 'custom', 0, ?, ?),
      (2, 'PKG-2', 'Tube', 'box', 20, 4, 4, 'custom', 0, ?, ?)
  `).run(now, now, now, now);
  db.prepare(`
    INSERT INTO products (productId, sku, weightOz, length, width, height, defaultPackageCode, modifyDate, updatedAt, createdAt)
    VALUES
      (10, 'SKU-1', 8, 12, 9, 6, 'PKG-1', ?, ?, ?),
      (11, 'SKU-MERGE', 0, 0, 0, 0, NULL, ?, ?, ?)
  `).run(now, now, now, now, now, now);
  db.prepare(`
    INSERT INTO sku_defaults (sku, weightOz, length, width, height, packageCode, updatedAt)
    VALUES
      ('SKU-MERGE', 5, 10, 8, 4, 'PKG-2', ?),
      ('SKU-LOCAL', 3, 6, 5, 4, 'PKG-2', ?)
  `).run(now, now);
  db.prepare(`
    INSERT INTO inventory_skus (clientId, sku, name, weightOz, length, width, height, createdAt, updatedAt)
    VALUES (1, 'SKU-FALLBACK', 'Fallback Item', 2, 7, 6, 5, ?, ?)
  `).run(now, now);
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

test("product endpoints support bulk lookup, by-sku defaults, and saving defaults", async () => {
  const dir = createTempDir();
  const dbPath = join(dir, "prepship.db");
  seedProductDatabase(dbPath);

  const { app } = bootstrapApi({
    SQLITE_DB_PATH: dbPath,
    API_PORT: "4010",
  }, {
    initMetadataProvider: new NoopInitMetadataProvider(),
  });

  const bulkResponse = await app(authedRequest("http://127.0.0.1:4010/api/products/bulk?skus=SKU-1,SKU-FALLBACK"));
  assert.equal(bulkResponse.status, 200);
  const bulkPayload = await bulkResponse.json() as Record<string, { weightOz: number }>;
  assert.equal(bulkPayload["SKU-1"]?.weightOz, 8);
  assert.equal(bulkPayload["SKU-FALLBACK"]?.weightOz, 2);

  const mergedResponse = await app(authedRequest("http://127.0.0.1:4010/api/products/by-sku/SKU-MERGE"));
  assert.equal(mergedResponse.status, 200);
  const mergedPayload = await mergedResponse.json() as { weightOz: number; defaultPackageCode: string | null };
  assert.equal(mergedPayload.weightOz, 5);
  assert.equal(mergedPayload.defaultPackageCode, "PKG-2");

  const localOnlyResponse = await app(authedRequest("http://127.0.0.1:4010/api/products/by-sku/SKU-LOCAL"));
  assert.equal(localOnlyResponse.status, 200);
  const localOnlyPayload = await localOnlyResponse.json() as { _localOnly?: boolean; length: number };
  assert.equal(localOnlyPayload._localOnly, true);
  assert.equal(localOnlyPayload.length, 6);

  const saveDefaultsResponse = await app(authedRequest("http://127.0.0.1:4010/api/products/save-defaults", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sku: "SKU-1",
      weightOz: 9,
      length: 14,
      width: 10,
      height: 7,
    }),
  }));
  assert.equal(saveDefaultsResponse.status, 200);
  const saveDefaultsPayload = await saveDefaultsResponse.json() as { resolvedPackageId: number | null; newPackageCreated?: boolean };
  assert.equal(saveDefaultsPayload.newPackageCreated, true);
  assert.equal(saveDefaultsPayload.resolvedPackageId != null, true);

  const postSaveResponse = await app(authedRequest("http://127.0.0.1:4010/api/products/by-sku/SKU-1"));
  assert.equal(postSaveResponse.status, 200);
  const postSavePayload = await postSaveResponse.json() as { weightOz: number; length: number };
  assert.equal(postSavePayload.weightOz, 9);
  assert.equal(postSavePayload.length, 14);

  const skuDefaultsResponse = await app(authedRequest("http://127.0.0.1:4010/api/products/SKU-LOCAL/defaults", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      weight: 4,
      length: 8,
      width: 6,
      height: 5,
      packageId: "2",
    }),
  }));
  assert.equal(skuDefaultsResponse.status, 200);
  const skuDefaultsPayload = await skuDefaultsResponse.json() as { localOnly?: boolean };
  assert.equal(skuDefaultsPayload.localOnly, true);

  const updatedLocalResponse = await app(authedRequest("http://127.0.0.1:4010/api/products/by-sku/SKU-LOCAL"));
  assert.equal(updatedLocalResponse.status, 200);
  const updatedLocalPayload = await updatedLocalResponse.json() as { weightOz: number; defaultPackageCode: string | null };
  assert.equal(updatedLocalPayload.weightOz, 4);
  assert.equal(updatedLocalPayload.defaultPackageCode, "2");
});
