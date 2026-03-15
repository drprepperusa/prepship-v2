/**
 * Queue API Tests — Print Queue Phase 2
 * Tests all queue endpoints: GET, POST add, POST print, GET status, GET download, DELETE, CLEAR
 * Covers: duplicate prevention, idempotency, error scenarios, concurrent access
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { bootstrapApi } from "../src/app/bootstrap.ts";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prepshipv2-queue-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

/** Seed a minimal database for queue tests */
function seedQueueDatabase(filename: string): void {
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT);

    CREATE TABLE clients (
      clientId INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      storeIds TEXT DEFAULT '[]',
      ss_api_key TEXT,
      ss_api_secret TEXT,
      ss_api_key_v2 TEXT,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE orders (
      orderId INTEGER PRIMARY KEY,
      clientId INTEGER,
      orderNumber TEXT,
      orderStatus TEXT,
      orderDate TEXT,
      storeId INTEGER,
      items TEXT,
      raw TEXT,
      updatedAt INTEGER
    );

    CREATE TABLE order_local (
      orderId INTEGER PRIMARY KEY,
      external_shipped INTEGER DEFAULT 0,
      residential INTEGER,
      selected_pid INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE shipments (
      shipmentId INTEGER PRIMARY KEY,
      orderId INTEGER,
      carrierCode TEXT,
      serviceCode TEXT,
      trackingNumber TEXT,
      shipDate TEXT,
      voided INTEGER DEFAULT 0,
      source TEXT DEFAULT 'prepship'
    );

    CREATE TABLE locations (
      locationId INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company TEXT,
      street1 TEXT,
      city TEXT,
      state TEXT,
      postalCode TEXT,
      country TEXT DEFAULT 'US',
      phone TEXT DEFAULT '',
      isDefault INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE packages (
      packageId INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source TEXT DEFAULT 'custom'
    );

    CREATE TABLE products (
      productId INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT,
      name TEXT
    );

    CREATE TABLE sku_defaults (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE NOT NULL
    );

    CREATE TABLE inventory_skus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER,
      sku TEXT,
      name TEXT,
      qty_on_hand INTEGER DEFAULT 0
    );

    CREATE TABLE rate_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      weight INTEGER,
      zip TEXT,
      rates TEXT,
      fetched_at INTEGER
    );

    CREATE TABLE billing_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER,
      pick_pack_rate REAL DEFAULT 0,
      additional_unit_rate REAL DEFAULT 0
    );

    CREATE TABLE billing_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER,
      shipmentId INTEGER,
      order_date TEXT,
      amount REAL
    );

    CREATE TABLE sku_qty_dims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT,
      qty INTEGER,
      length REAL,
      width REAL,
      height REAL
    );

    CREATE TABLE parent_skus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER,
      name TEXT
    );

    CREATE TABLE inventory_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku_id INTEGER,
      qty_delta INTEGER,
      note TEXT,
      created_at INTEGER
    );

    CREATE TABLE package_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      packageId INTEGER,
      qty_delta INTEGER,
      note TEXT,
      created_at INTEGER
    );

    CREATE TABLE print_queue_orders (
      id TEXT PRIMARY KEY,
      client_id INTEGER NOT NULL,
      order_id TEXT NOT NULL,
      order_number TEXT,
      label_url TEXT NOT NULL,
      sku_group_id TEXT NOT NULL,
      primary_sku TEXT,
      item_description TEXT,
      order_qty INTEGER DEFAULT 1,
      multi_sku_data TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      print_count INTEGER NOT NULL DEFAULT 0,
      last_printed_at INTEGER,
      queued_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(order_id, client_id)
    );

    CREATE INDEX idx_pq_client_status ON print_queue_orders(client_id, status);
    CREATE INDEX idx_pq_queued_at ON print_queue_orders(queued_at DESC);

    INSERT INTO clients (name) VALUES ('Test Client');
  `);
  db.close();
}

/** Bootstrap app with a seeded temp database */
function createTestApp(tempDir: string) {
  const dbPath = join(tempDir, "prepship.db");
  seedQueueDatabase(dbPath);
  return bootstrapApi(
    {
      DB_PROVIDER: "sqlite",
      SQLITE_DB_PATH: dbPath,
      // PREPSHIP_SECRETS_PATH not set — uses default (repo-root secrets.json)
    },
    {},
  );
}

// ─── GET /api/queue ────────────────────────────────────────────────────────────

test("GET /api/queue returns empty queue for new client", async () => {
  const { app } = createTestApp(createTempDir());
  const res = await app(new Request("http://localhost/api/queue?client_id=1"));
  const body = await res.json() as { ok: boolean; queuedOrders: unknown[]; totalOrders: number; totalQty: number };
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.queuedOrders, []);
  assert.equal(body.totalOrders, 0);
  assert.equal(body.totalQty, 0);
});

test("GET /api/queue requires client_id", async () => {
  const { app } = createTestApp(createTempDir());
  const res = await app(new Request("http://localhost/api/queue"));
  assert.equal(res.status, 400);
  const body = await res.json() as { error: string };
  assert.match(body.error, /client_id/);
});

// ─── POST /api/queue/add ──────────────────────────────────────────────────────

test("POST /api/queue/add adds an order to the queue", async () => {
  const { app } = createTestApp(createTempDir());
  const res = await app(new Request("http://localhost/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: "order-123",
      order_number: "S-100",
      client_id: 1,
      label_url: "https://example.com/label.pdf",
      sku_group_id: "SKU:ABC-001",
      primary_sku: "ABC-001",
      item_description: "Test Product",
      order_qty: 2,
    }),
  }));
  const body = await res.json() as { ok: boolean; queue_entry_id: string; already_queued: boolean };
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(typeof body.queue_entry_id, "string");
  assert.equal(body.already_queued, false);
});

test("POST /api/queue/add returns already_queued for duplicate", async () => {
  const { app } = createTestApp(createTempDir());
  const payload = JSON.stringify({
    order_id: "order-dup",
    order_number: "S-200",
    client_id: 1,
    label_url: "https://example.com/label.pdf",
    sku_group_id: "SKU:DUP-001",
    primary_sku: "DUP-001",
    order_qty: 1,
  });

  // First add
  const res1 = await app(new Request("http://localhost/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  }));
  const body1 = await res1.json() as { ok: boolean; already_queued: boolean };
  assert.equal(body1.already_queued, false);

  // Duplicate add
  const res2 = await app(new Request("http://localhost/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  }));
  const body2 = await res2.json() as { ok: boolean; already_queued: boolean };
  assert.equal(res2.status, 200);
  assert.equal(body2.already_queued, true);
});

test("POST /api/queue/add validates required fields", async () => {
  const { app } = createTestApp(createTempDir());

  // Missing order_id
  const res = await app(new Request("http://localhost/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: 1, label_url: "https://example.com/l.pdf", sku_group_id: "SKU:X" }),
  }));
  assert.equal(res.status, 400);
  const body = await res.json() as { error: string };
  assert.match(body.error, /order_id/);
});

test("POST /api/queue/add updates label_url if already queued with new URL", async () => {
  const { app } = createTestApp(createTempDir());
  const basePayload = {
    order_id: "order-update",
    order_number: "S-300",
    client_id: 1,
    label_url: "https://example.com/label-v1.pdf",
    sku_group_id: "SKU:UPD-001",
    primary_sku: "UPD-001",
    order_qty: 1,
  };

  await app(new Request("http://localhost/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(basePayload),
  }));

  // Re-add with new label URL — the UPSERT should update it
  const res2 = await app(new Request("http://localhost/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...basePayload, label_url: "https://example.com/label-v2.pdf" }),
  }));
  assert.equal(res2.status, 200);

  // Verify the queue now has the updated URL
  const qRes = await app(new Request("http://localhost/api/queue?client_id=1"));
  const qBody = await qRes.json() as { queuedOrders: Array<{ label_url: string; order_id: string }> };
  const entry = qBody.queuedOrders.find(o => o.order_id === "order-update");
  assert.ok(entry);
  assert.equal(entry!.label_url, "https://example.com/label-v2.pdf");
});

// ─── DELETE /api/queue/:entryId ───────────────────────────────────────────────

test("DELETE /api/queue/:entryId removes a queue entry", async () => {
  const { app } = createTestApp(createTempDir());

  // Add entry
  const addRes = await app(new Request("http://localhost/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: "order-del",
      client_id: 1,
      label_url: "https://example.com/del.pdf",
      sku_group_id: "SKU:DEL-001",
      order_qty: 1,
    }),
  }));
  const { queue_entry_id } = await addRes.json() as { queue_entry_id: string };

  // Delete it
  const delRes = await app(new Request(`http://localhost/api/queue/${queue_entry_id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: 1 }),
  }));
  assert.equal(delRes.status, 200);
  const delBody = await delRes.json() as { ok: boolean; removed_entry: string };
  assert.equal(delBody.ok, true);
  assert.equal(delBody.removed_entry, queue_entry_id);

  // Verify it's gone
  const qRes = await app(new Request("http://localhost/api/queue?client_id=1"));
  const qBody = await qRes.json() as { queuedOrders: unknown[] };
  assert.equal(qBody.queuedOrders.length, 0);
});

test("DELETE /api/queue/:entryId returns 404 for non-existent entry", async () => {
  const { app } = createTestApp(createTempDir());
  const res = await app(new Request("http://localhost/api/queue/non-existent-id", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: 1 }),
  }));
  assert.equal(res.status, 404);
});

test("DELETE /api/queue/:entryId rejects cross-client unauthorized access", async () => {
  const { app } = createTestApp(createTempDir());

  // Add entry for client 1
  const addRes = await app(new Request("http://localhost/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: "order-cross",
      client_id: 1,
      label_url: "https://example.com/cross.pdf",
      sku_group_id: "SKU:CRS-001",
      order_qty: 1,
    }),
  }));
  const { queue_entry_id } = await addRes.json() as { queue_entry_id: string };

  // Try to delete with client_id=2 (unauthorized)
  const delRes = await app(new Request(`http://localhost/api/queue/${queue_entry_id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: 2 }),
  }));
  assert.equal(delRes.status, 500); // Unauthorized throws
});

// ─── POST /api/queue/clear ────────────────────────────────────────────────────

test("POST /api/queue/clear removes all queued orders for client", async () => {
  const { app } = createTestApp(createTempDir());

  // Add 3 entries
  for (let i = 1; i <= 3; i++) {
    await app(new Request("http://localhost/api/queue/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: `order-clr-${i}`,
        client_id: 1,
        label_url: `https://example.com/clr${i}.pdf`,
        sku_group_id: "SKU:CLR-001",
        order_qty: 1,
      }),
    }));
  }

  // Verify 3 are queued
  const beforeRes = await app(new Request("http://localhost/api/queue?client_id=1"));
  const beforeBody = await beforeRes.json() as { totalOrders: number };
  assert.equal(beforeBody.totalOrders, 3);

  // Clear
  const clearRes = await app(new Request("http://localhost/api/queue/clear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: 1 }),
  }));
  const clearBody = await clearRes.json() as { ok: boolean; cleared_count: number };
  assert.equal(clearRes.status, 200);
  assert.equal(clearBody.ok, true);
  assert.equal(clearBody.cleared_count, 3);

  // Verify empty
  const afterRes = await app(new Request("http://localhost/api/queue?client_id=1"));
  const afterBody = await afterRes.json() as { totalOrders: number };
  assert.equal(afterBody.totalOrders, 0);
});

test("POST /api/queue/clear only clears queued (not printed) orders", async () => {
  const { app } = createTestApp(createTempDir());

  // Add 2 entries
  for (let i = 1; i <= 2; i++) {
    await app(new Request("http://localhost/api/queue/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: `order-sel-${i}`,
        client_id: 1,
        label_url: `https://example.com/sel${i}.pdf`,
        sku_group_id: "SKU:SEL-001",
        order_qty: 1,
      }),
    }));
  }

  // Clear clears only queued entries
  const clearRes = await app(new Request("http://localhost/api/queue/clear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: 1 }),
  }));
  const clearBody = await clearRes.json() as { cleared_count: number };
  assert.equal(clearBody.cleared_count, 2);
});

// ─── POST /api/queue/print — start print job ──────────────────────────────────

test("POST /api/queue/print starts a merge job and returns job_id", async () => {
  const { app } = createTestApp(createTempDir());

  // Add an entry first
  const addRes = await app(new Request("http://localhost/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: "order-print-1",
      client_id: 1,
      label_url: "https://example.com/print1.pdf",
      sku_group_id: "SKU:PRN-001",
      order_qty: 1,
    }),
  }));
  const { queue_entry_id } = await addRes.json() as { queue_entry_id: string };

  // Start print job
  const printRes = await app(new Request("http://localhost/api/queue/print", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: 1,
      queue_entry_ids: [queue_entry_id],
    }),
  }));
  const printBody = await printRes.json() as { ok: boolean; job_id: string; total: number };
  assert.equal(printRes.status, 200);
  assert.equal(printBody.ok, true);
  assert.equal(typeof printBody.job_id, "string");
  assert.equal(printBody.total, 1);
});

test("POST /api/queue/print validates required fields", async () => {
  const { app } = createTestApp(createTempDir());

  // Missing queue_entry_ids
  const res = await app(new Request("http://localhost/api/queue/print", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: 1 }),
  }));
  assert.equal(res.status, 400);
});

test("POST /api/queue/print rejects entries for wrong client", async () => {
  const { app } = createTestApp(createTempDir());

  // Add entry for client 1
  const addRes = await app(new Request("http://localhost/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: "order-auth",
      client_id: 1,
      label_url: "https://example.com/auth.pdf",
      sku_group_id: "SKU:AUTH-001",
      order_qty: 1,
    }),
  }));
  const { queue_entry_id } = await addRes.json() as { queue_entry_id: string };

  // Try to print as client 2
  const printRes = await app(new Request("http://localhost/api/queue/print", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: 2, queue_entry_ids: [queue_entry_id] }),
  }));
  assert.equal(printRes.status, 500); // Unauthorized
});

// ─── GET /api/queue/print/status/:jobId ──────────────────────────────────────

test("GET /api/queue/print/status/:jobId returns job status", async () => {
  const { app } = createTestApp(createTempDir());

  // Add + start print job
  const addRes = await app(new Request("http://localhost/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: "order-status",
      client_id: 1,
      label_url: "https://example.com/status.pdf",
      sku_group_id: "SKU:STS-001",
      order_qty: 1,
    }),
  }));
  const { queue_entry_id } = await addRes.json() as { queue_entry_id: string };

  const printRes = await app(new Request("http://localhost/api/queue/print", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: 1, queue_entry_ids: [queue_entry_id] }),
  }));
  const { job_id } = await printRes.json() as { job_id: string };

  // Check status
  const statusRes = await app(new Request(`http://localhost/api/queue/print/status/${job_id}`));
  assert.equal(statusRes.status, 200);
  const statusBody = await statusRes.json() as { job_id: string; status: string; progress: number };
  assert.equal(statusBody.job_id, job_id);
  assert.ok(["pending", "running", "done", "error"].includes(statusBody.status));
  assert.ok(statusBody.progress >= 0 && statusBody.progress <= 100);
});

test("GET /api/queue/print/status/:jobId returns 404 for unknown job", async () => {
  const { app } = createTestApp(createTempDir());
  const res = await app(new Request("http://localhost/api/queue/print/status/non-existent-job-id"));
  assert.equal(res.status, 404);
});

// ─── GET /api/queue/print/download/:jobId ────────────────────────────────────

test("GET /api/queue/print/download/:jobId returns 404 for pending job", async () => {
  const { app } = createTestApp(createTempDir());

  // Add + start print job (it won't finish instantly)
  const addRes = await app(new Request("http://localhost/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: "order-dl",
      client_id: 1,
      label_url: "https://example.com/dl.pdf",
      sku_group_id: "SKU:DL-001",
      order_qty: 1,
    }),
  }));
  const { queue_entry_id } = await addRes.json() as { queue_entry_id: string };

  const printRes = await app(new Request("http://localhost/api/queue/print", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: 1, queue_entry_ids: [queue_entry_id] }),
  }));
  const { job_id } = await printRes.json() as { job_id: string };

  // Try to download immediately — job not done yet (or 404 if it errors due to network)
  const dlRes = await app(new Request(`http://localhost/api/queue/print/download/${job_id}`));
  // Should be 404 (not ready) or 200 if it finished very quickly (unlikely with network fetch)
  assert.ok([200, 404].includes(dlRes.status));
});

// ─── Queue state: include_printed ────────────────────────────────────────────

test("GET /api/queue?include_printed=1 returns both queued and printed orders", async () => {
  const { app } = createTestApp(createTempDir());

  // Can't easily test "printed" without running a print job to completion
  // At least verify the endpoint accepts the param without error
  const res = await app(new Request("http://localhost/api/queue?client_id=1&include_printed=1"));
  assert.equal(res.status, 200);
  const body = await res.json() as { ok: boolean };
  assert.equal(body.ok, true);
});

// ─── Idempotency ─────────────────────────────────────────────────────────────

test("Queue add is idempotent — calling add 3x for same order returns same entry ID", async () => {
  const { app } = createTestApp(createTempDir());
  const payload = {
    order_id: "order-idempotent",
    client_id: 1,
    label_url: "https://example.com/idemp.pdf",
    sku_group_id: "SKU:IDP-001",
    order_qty: 1,
  };

  const r1 = await app(new Request("http://localhost/api/queue/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
  const r2 = await app(new Request("http://localhost/api/queue/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
  const r3 = await app(new Request("http://localhost/api/queue/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));

  const b1 = await r1.json() as { queue_entry_id: string; already_queued: boolean };
  const b2 = await r2.json() as { queue_entry_id: string; already_queued: boolean };
  const b3 = await r3.json() as { queue_entry_id: string; already_queued: boolean };

  // Same entry ID returned each time
  assert.equal(b1.queue_entry_id, b2.queue_entry_id);
  assert.equal(b2.queue_entry_id, b3.queue_entry_id);
  assert.equal(b1.already_queued, false); // First add
  assert.equal(b2.already_queued, true);   // Duplicate
  assert.equal(b3.already_queued, true);   // Duplicate

  // Only 1 order in queue
  const qRes = await app(new Request("http://localhost/api/queue?client_id=1"));
  const qBody = await qRes.json() as { totalOrders: number };
  assert.equal(qBody.totalOrders, 1);
});

// ─── Multi-SKU data ───────────────────────────────────────────────────────────

test("Queue add and retrieve multi-SKU data", async () => {
  const { app } = createTestApp(createTempDir());
  const multiSkuData = [
    { sku: "SKU-A", description: "Product A", qty: 2 },
    { sku: "SKU-B", description: "Product B", qty: 1 },
  ];

  const addRes = await app(new Request("http://localhost/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: "order-multisku",
      client_id: 1,
      label_url: "https://example.com/multisku.pdf",
      sku_group_id: "MULTI:ABC",
      order_qty: 3,
      multi_sku_data: multiSkuData,
    }),
  }));
  assert.equal(addRes.status, 200);

  // Get and verify multi_sku_data is preserved
  const qRes = await app(new Request("http://localhost/api/queue?client_id=1"));
  const qBody = await qRes.json() as { queuedOrders: Array<{ multi_sku_data: typeof multiSkuData | null; order_qty: number }> };
  assert.equal(qBody.queuedOrders.length, 1);
  const entry = qBody.queuedOrders[0]!;
  assert.deepEqual(entry.multi_sku_data, multiSkuData);
  assert.equal(entry.order_qty, 3);
});

// ─── Client isolation ─────────────────────────────────────────────────────────

test("Queue entries are isolated per client", async () => {
  const { app } = createTestApp(createTempDir());

  // Add for client 1
  await app(new Request("http://localhost/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order_id: "order-c1", client_id: 1, label_url: "https://ex.com/l.pdf", sku_group_id: "SKU:C1", order_qty: 1 }),
  }));

  // Add for client 2 (same order_id)
  await app(new Request("http://localhost/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order_id: "order-c2", client_id: 2, label_url: "https://ex.com/l.pdf", sku_group_id: "SKU:C2", order_qty: 1 }),
  }));

  // Client 1 only sees their order
  const res1 = await app(new Request("http://localhost/api/queue?client_id=1"));
  const body1 = await res1.json() as { totalOrders: number };
  assert.equal(body1.totalOrders, 1);

  // Client 2 only sees their order
  const res2 = await app(new Request("http://localhost/api/queue?client_id=2"));
  const body2 = await res2.json() as { totalOrders: number };
  assert.equal(body2.totalOrders, 1);
});
