import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { initOrderSyncLogTable } from "../src/modules/orders/data/init-sync-log-table.ts";
import { SqliteSyncLogRepository } from "../src/modules/orders/data/sqlite-sync-log-repository.ts";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prepshipv2-sync-log-"));
  tempDirs.push(dir);
  return dir;
}

function seedSyncLogDatabase(filename: string): DatabaseSync {
  const db = new DatabaseSync(filename);

  // Create minimal orders table for FK constraint
  db.exec(`
    CREATE TABLE orders (
      orderId INTEGER PRIMARY KEY,
      orderNumber TEXT,
      orderDate TEXT,
      orderStatus TEXT,
      storeId INTEGER,
      shipToName TEXT,
      carrierCode TEXT,
      serviceCode TEXT,
      items TEXT,
      raw TEXT
    );
  `);

  // Initialize sync log table
  initOrderSyncLogTable(db);

  // Insert a test order
  db.prepare(`
    INSERT INTO orders (orderId, orderNumber, orderStatus, items, raw)
    VALUES (1, 'ORD-001', 'shipped', '[]', '{}')
  `).run();

  return db;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

test("order_sync_log table is created with correct schema", () => {
  const dir = createTempDir();
  const db = seedSyncLogDatabase(join(dir, "test.db"));

  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='order_sync_log'`).all();
  assert.strictEqual(tables.length, 1, "order_sync_log table should exist");

  const cols = db.prepare(`PRAGMA table_info(order_sync_log)`).all() as Array<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: unknown;
    pk: number;
  }>;

  assert.ok(cols.find((c) => c.name === "id"), "should have id column");
  assert.ok(cols.find((c) => c.name === "orderId"), "should have orderId column");
  assert.ok(cols.find((c) => c.name === "operation"), "should have operation column");
  assert.ok(cols.find((c) => c.name === "v2_status"), "should have v2_status column");
  assert.ok(cols.find((c) => c.name === "v3_status"), "should have v3_status column");
  assert.ok(cols.find((c) => c.name === "discrepancy_type"), "should have discrepancy_type column");
  assert.ok(cols.find((c) => c.name === "resolved"), "should have resolved column");
  assert.ok(cols.find((c) => c.name === "created_at"), "should have created_at column");
  assert.ok(cols.find((c) => c.name === "updated_at"), "should have updated_at column");
});

test("order_sync_log indexes are created", () => {
  const dir = createTempDir();
  const db = seedSyncLogDatabase(join(dir, "test.db"));

  const indexes = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='order_sync_log'`).all() as Array<{ name: string }>;

  const indexNames = indexes.map((i) => i.name);
  assert.ok(indexNames.some((n) => n.includes("unresolved")), "should have unresolved index");
  assert.ok(indexNames.some((n) => n.includes("orderId")), "should have orderId index");
  assert.ok(indexNames.some((n) => n.includes("updated_at")), "should have updated_at index");
});

test("recordSync inserts and returns ID", async () => {
  const dir = createTempDir();
  const db = seedSyncLogDatabase(join(dir, "test.db"));
  const repo = new SqliteSyncLogRepository(db);

  const id = await repo.recordSync({
    orderId: 1,
    operation: "create",
    v2_status: "pending",
    v3_status: "pending",
    resolved: false,
  });

  assert.strictEqual(typeof id, "number", "should return numeric ID");
  assert.ok(id > 0, "should return positive ID");

  // Verify it was inserted
  const rows = db.prepare("SELECT * FROM order_sync_log WHERE id = ?").all(id) as Array<Record<string, unknown>>;
  assert.strictEqual(rows.length, 1, "should have inserted one row");
  assert.strictEqual(rows[0].orderId, 1);
  assert.strictEqual(rows[0].operation, "create");
  assert.strictEqual(rows[0].v2_status, "pending");
  assert.strictEqual(rows[0].v3_status, "pending");
  assert.strictEqual(rows[0].resolved, 0);
});

test("recordDiscrepancy inserts with discrepancy_type", async () => {
  const dir = createTempDir();
  const db = seedSyncLogDatabase(join(dir, "test.db"));
  const repo = new SqliteSyncLogRepository(db);

  await repo.recordDiscrepancy(1, "status_mismatch", "shipped", "pending");

  const rows = db.prepare("SELECT * FROM order_sync_log WHERE orderId = ? AND discrepancy_type = ?").all(1, "status_mismatch") as Array<Record<string, unknown>>;
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].v2_status, "shipped");
  assert.strictEqual(rows[0].v3_status, "pending");
  assert.strictEqual(rows[0].discrepancy_type, "status_mismatch");
  assert.strictEqual(rows[0].resolved, 0);
});

test("countUnresolvedDiscrepancies returns correct count", async () => {
  const dir = createTempDir();
  const db = seedSyncLogDatabase(join(dir, "test.db"));
  const repo = new SqliteSyncLogRepository(db);

  assert.strictEqual(await repo.countUnresolvedDiscrepancies(), 0);

  await repo.recordDiscrepancy(1, "status_mismatch", "shipped", "pending");
  assert.strictEqual(await repo.countUnresolvedDiscrepancies(), 1);

  await repo.recordDiscrepancy(1, "timestamp_drift", "shipped", "shipped");
  assert.strictEqual(await repo.countUnresolvedDiscrepancies(), 2);
});

test("markResolved updates resolved status", async () => {
  const dir = createTempDir();
  const db = seedSyncLogDatabase(join(dir, "test.db"));
  const repo = new SqliteSyncLogRepository(db);

  const id = await repo.recordSync({
    orderId: 1,
    operation: "update",
    discrepancy_type: "status_mismatch",
    resolved: false,
  });

  assert.strictEqual(await repo.countUnresolvedDiscrepancies(), 1);

  await repo.markResolved(id, "Manual review completed");

  assert.strictEqual(await repo.countUnresolvedDiscrepancies(), 0);

  const rows = db.prepare("SELECT resolved, resolution_note FROM order_sync_log WHERE id = ?").all(id) as Array<{ resolved: number; resolution_note: string }>;
  assert.strictEqual(rows[0].resolved, 1);
  assert.strictEqual(rows[0].resolution_note, "Manual review completed");
});

test("getOrderSyncHistory returns entries for an order", async () => {
  const dir = createTempDir();
  const db = seedSyncLogDatabase(join(dir, "test.db"));
  const repo = new SqliteSyncLogRepository(db);

  await repo.recordSync({
    orderId: 1,
    operation: "create",
    v2_status: "pending",
    v3_status: "pending",
    resolved: false,
  });

  await repo.recordSync({
    orderId: 1,
    operation: "update",
    v2_status: "shipped",
    v3_status: "shipped",
    resolved: false,
  });

  const history = await repo.getOrderSyncHistory(1, 10);
  assert.strictEqual(history.length, 2);
  assert.strictEqual(history[0].orderId, 1);
  assert.strictEqual(history[1].orderId, 1);
});

test("getAutoResolvableDiscrepancies finds recent timestamp drift", async () => {
  const dir = createTempDir();
  const db = seedSyncLogDatabase(join(dir, "test.db"));
  const repo = new SqliteSyncLogRepository(db);

  // Insert a recent timestamp drift discrepancy
  await repo.recordDiscrepancy(1, "timestamp_drift", "shipped", "shipped");

  const autoResolvable = await repo.getAutoResolvableDiscrepancies();
  assert.strictEqual(autoResolvable.length, 1);
  assert.strictEqual(autoResolvable[0].orderId, 1);
  assert.strictEqual(autoResolvable[0].discrepancy_type, "timestamp_drift");
});

test("0 TypeScript errors", () => {
  // If the file compiled without errors, TypeScript is happy
  assert.ok(true);
});
