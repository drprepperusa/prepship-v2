/**
 * Order Status Sync Worker
 *
 * Two jobs running on the same interval (3 minutes):
 *
 * 1. STATUS SYNC — polls SS for recently-modified shipped orders and marks
 *    matching awaiting_shipment orders in our DB as shipped.
 *
 * 2. ORDER INGEST — polls SS for recently-modified awaiting_shipment orders
 *    and inserts any that don't exist in our DB yet (new orders).
 *
 * Supports multiple SS accounts (main + per-client keys from clients table).
 * Enabled with WORKER_SYNC_ENABLED=true.
 */

import type { DatabaseSync } from "node:sqlite";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SyncAccount {
  clientId: number;
  accountName: string;
  apiKey: string;
  apiSecret: string;
  storeIds: number[]; // storeIds this account is responsible for
}

interface SSOrderSummary {
  orderId: number;
  orderNumber: string;
  orderStatus: string;
  orderDate: string;
  modifyDate: string;
  customerEmail: string | null;
  shipTo: {
    name: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
  };
  carrierCode: string | null;
  serviceCode: string | null;
  weight: { value: number; units: string } | null;
  orderTotal: number;
  shippingAmount: number;
  items: unknown[];
  advancedOptions: { storeId: number | null } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function basicAuth(apiKey: string, apiSecret: string): string {
  return "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
}

function toISOStringUTC(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function fetchOrderPage(
  account: SyncAccount,
  orderStatus: string,
  modifyDateStart: string,
  page: number,
): Promise<{ orders: SSOrderSummary[]; pages: number }> {
  const params = new URLSearchParams({
    orderStatus,
    modifyDateStart,
    pageSize: "500",
    page: String(page),
  });

  const url = `https://ssapi.shipstation.com/orders?${params.toString()}`;
  const resp = await fetch(url, {
    headers: { Authorization: basicAuth(account.apiKey, account.apiSecret) },
    signal: AbortSignal.timeout(30_000),
  });

  if (resp.status === 429) {
    const retryAfter = Number(resp.headers.get("X-Rate-Limit-Reset") ?? "10");
    console.warn(`[sync] Rate limited on ${account.accountName}, waiting ${retryAfter}s`);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return fetchOrderPage(account, orderStatus, modifyDateStart, page);
  }

  if (!resp.ok) {
    throw new Error(`ShipStation API ${resp.status} for ${account.accountName} (${orderStatus})`);
  }

  const data = (await resp.json()) as { orders?: SSOrderSummary[]; pages?: number };
  return { orders: data.orders ?? [], pages: data.pages ?? 1 };
}

// ─── Account loader ───────────────────────────────────────────────────────────

function loadAccounts(db: DatabaseSync, mainApiKey: string, mainApiSecret: string): SyncAccount[] {
  const accounts: SyncAccount[] = [];

  // Build storeId → clientId map from clients table
  const clientRows = db.prepare(`
    SELECT clientId, storeIds FROM clients WHERE active = 1
  `).all() as Array<{ clientId: number; storeIds: string }>;

  const mainStoreIds: number[] = [];
  const clientStoreMap = new Map<number, number[]>(); // clientId → storeIds

  for (const row of clientRows) {
    try {
      const ids = JSON.parse(row.storeIds ?? "[]") as number[];
      clientStoreMap.set(row.clientId, ids);
      // storeIds without their own SS key belong to main account
      mainStoreIds.push(...ids);
    } catch { /* ignore */ }
  }

  if (mainApiKey && mainApiSecret) {
    accounts.push({
      clientId: 0,
      accountName: "main",
      apiKey: mainApiKey,
      apiSecret: mainApiSecret,
      storeIds: mainStoreIds,
    });
  }

  // Per-client SS keys (e.g. KFG)
  const clientKeyRows = db.prepare(`
    SELECT clientId, name, ss_api_key, ss_api_secret, storeIds
    FROM clients
    WHERE active = 1 AND ss_api_key IS NOT NULL AND ss_api_key != ''
  `).all() as Array<{ clientId: number; name: string; ss_api_key: string; ss_api_secret: string; storeIds: string }>;

  for (const row of clientKeyRows) {
    let storeIds: number[] = [];
    try { storeIds = JSON.parse(row.storeIds ?? "[]") as number[]; } catch { /* ignore */ }
    accounts.push({
      clientId: row.clientId,
      accountName: row.name,
      apiKey: row.ss_api_key,
      apiSecret: row.ss_api_secret,
      storeIds,
    });
  }

  return accounts;
}

// ─── Resolve clientId for a SS order ─────────────────────────────────────────

function resolveClientId(db: DatabaseSync, storeId: number | null): number | null {
  if (!storeId) return null;
  const row = db.prepare(`
    SELECT clientId FROM clients
    WHERE active = 1 AND storeIds LIKE ? LIMIT 1
  `).get(`%${storeId}%`) as { clientId: number } | undefined;
  return row?.clientId ?? null;
}

// ─── Shipment detail fetch + save ────────────────────────────────────────────

async function fetchAndSaveShipment(
  db: DatabaseSync,
  account: SyncAccount,
  orderId: number,
  orderNumber: string,
): Promise<void> {
  const url = `https://ssapi.shipstation.com/shipments?orderNumber=${encodeURIComponent(orderNumber)}`;
  const resp = await fetch(url, {
    headers: { Authorization: basicAuth(account.apiKey, account.apiSecret) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) return;

  const data = (await resp.json()) as { shipments?: Array<Record<string, unknown>> };
  const shipments = (data.shipments ?? []).filter((s) => !s.voided);

  // No SS shipment record → shipped externally (Amazon/marketplace carrier)
  if (!shipments.length) {
    const now2 = Date.now();
    db.prepare(`INSERT OR IGNORE INTO order_local (orderId, external_shipped, updatedAt) VALUES (?, 1, ?)`)
      .run(orderId, now2);
    db.prepare(`UPDATE order_local SET external_shipped = 1, updatedAt = ? WHERE orderId = ?`)
      .run(now2, orderId);
    return;
  }

  const s = shipments[0]!;
  const shipmentId = Number(s.shipmentId);
  const trackingNumber = s.trackingNumber ? String(s.trackingNumber) : null;
  const carrierCode = s.carrierCode ? String(s.carrierCode) : null;
  const serviceCode = s.serviceCode ? String(s.serviceCode) : null;
  const shipDate = s.shipDate ? String(s.shipDate) : new Date().toISOString().slice(0, 10);
  const shipmentCost = Number(s.shipmentCost ?? 0);
  const labelUrl = s.formUrl ? String(s.formUrl) : null;
  const now = Date.now();

  // Check if shipment already exists
  const exists = db.prepare(`SELECT 1 FROM shipments WHERE shipmentId = ? LIMIT 1`).get(shipmentId);
  if (exists) return;

  // Look up clientId and storeId from the order
  const orderRow = db.prepare(`SELECT clientId, storeId FROM orders WHERE orderId = ? LIMIT 1`)
    .get(orderId) as { clientId: number; storeId: number | null } | undefined;

  db.prepare(`
    INSERT OR IGNORE INTO shipments (
      shipmentId, orderId, orderNumber, carrierCode, serviceCode,
      trackingNumber, shipDate, labelUrl, shipmentCost, otherCost,
      voided, updatedAt, weightOz, createDate, clientId,
      providerAccountId, source, label_created_at, label_format
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    shipmentId, orderId, orderNumber, carrierCode, serviceCode,
    trackingNumber, shipDate, labelUrl, shipmentCost, 0,
    0, now, null, new Date().toISOString(), orderRow?.clientId ?? null,
    null, "ss_sync", now, "pdf"
  );

  // Real SS shipment saved — ensure order_local reflects this:
  // external_shipped = 0 (has a real SS label), tracking saved
  const hasLocal = db.prepare(`SELECT 1 FROM order_local WHERE orderId = ? LIMIT 1`).get(orderId);
  if (hasLocal) {
    db.prepare(`UPDATE order_local SET external_shipped = 0, tracking_number = ?, updatedAt = ? WHERE orderId = ?`)
      .run(trackingNumber, now, orderId);
  } else {
    db.prepare(`INSERT OR IGNORE INTO order_local (orderId, external_shipped, tracking_number, updatedAt) VALUES (?,0,?,?)`)
      .run(orderId, trackingNumber, now);
  }

  console.log(`[sync] Saved shipment for ${orderNumber}: tracking=${trackingNumber ?? "none"} cost=$${shipmentCost}`);
}

// ─── Job 1: Status Sync (awaiting → shipped) ─────────────────────────────────

async function runStatusSync(
  db: DatabaseSync,
  accounts: SyncAccount[],
  modifyDateStart: string,
): Promise<number> {
  let updated = 0;

  for (const account of accounts) {
    let page = 1, pages = 1;
    do {
      const result = await fetchOrderPage(account, "shipped", modifyDateStart, page);
      pages = result.pages;

      for (const order of result.orders) {
        if (!order.orderNumber) continue;

        // SS is source of truth — match on orderNumber
        const existing = db.prepare(`
          SELECT orderId FROM orders WHERE orderNumber = ? AND orderStatus = 'awaiting_shipment' LIMIT 1
        `).get(order.orderNumber) as { orderId: number } | undefined;

        if (!existing) continue;

        const now = Date.now();
        db.prepare(`UPDATE orders SET orderStatus = 'shipped', updatedAt = ? WHERE orderId = ?`)
          .run(now, existing.orderId);
        // Ensure order_local row exists. Do NOT set external_shipped yet —
        // fetchAndSaveShipment will set it to 0 if SS has a real shipment record,
        // or to 1 if no SS shipment exists (Amazon/marketplace-fulfilled).
        db.prepare(`INSERT OR IGNORE INTO order_local (orderId, updatedAt) VALUES (?, ?)`)
          .run(existing.orderId, now);

        // Fetch shipment details from SS to get tracking number, cost, etc.
        // This also resolves external_shipped correctly based on whether SS has a label.
        void fetchAndSaveShipment(db, account, existing.orderId, order.orderNumber).catch(() => {/* non-fatal */});

        updated++;
        console.log(`[sync] Marked shipped: ${order.orderNumber} (orderId=${existing.orderId}) via ${account.accountName}`);
      }

      page++;
      if (page <= pages) await new Promise((r) => setTimeout(r, 500));
    } while (page <= pages);

    if (accounts.indexOf(account) < accounts.length - 1) {
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }

  return updated;
}

// ─── Job 1b: Cancellation Sync ────────────────────────────────────────────────

async function runCancellationSync(
  db: DatabaseSync,
  accounts: SyncAccount[],
  modifyDateStart: string,
): Promise<number> {
  let cancelled = 0;

  for (const account of accounts) {
    let page = 1, pages = 1;
    do {
      const result = await fetchOrderPage(account, "cancelled", modifyDateStart, page);
      pages = result.pages;

      for (const order of result.orders) {
        if (!order.orderNumber) continue;

        // Only update orders we currently show as awaiting_shipment
        const existing = db.prepare(`
          SELECT orderId FROM orders WHERE orderNumber = ? AND orderStatus = 'awaiting_shipment' LIMIT 1
        `).get(order.orderNumber) as { orderId: number } | undefined;

        if (!existing) continue;

        db.prepare(`UPDATE orders SET orderStatus = 'cancelled', updatedAt = ? WHERE orderId = ?`)
          .run(Date.now(), existing.orderId);

        cancelled++;
        console.log(`[sync] Marked cancelled: ${order.orderNumber} (orderId=${existing.orderId}) via ${account.accountName}`);
      }

      page++;
      if (page <= pages) await new Promise((r) => setTimeout(r, 500));
    } while (page <= pages);

    if (accounts.indexOf(account) < accounts.length - 1) {
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }

  return cancelled;
}

// ─── Job 2: Order Ingest (new awaiting_shipment orders) ──────────────────────

async function runOrderIngest(
  db: DatabaseSync,
  accounts: SyncAccount[],
  modifyDateStart: string,
): Promise<number> {
  let inserted = 0;

  for (const account of accounts) {
    let page = 1, pages = 1;
    do {
      const result = await fetchOrderPage(account, "awaiting_shipment", modifyDateStart, page);
      pages = result.pages;

      for (const order of result.orders) {
        if (!order.orderId || !order.orderNumber) continue;

        // Skip if already in DB
        const exists = db.prepare(`SELECT 1 FROM orders WHERE orderId = ? LIMIT 1`)
          .get(order.orderId) as { 1: number } | undefined;
        if (exists) continue;

        const storeId = order.advancedOptions?.storeId ?? null;
        const clientId = resolveClientId(db, storeId);
        if (!clientId) {
          // Skip orders from stores not mapped to any client (excluded stores, test stores, etc.)
          continue;
        }

        const weightOz = order.weight?.value != null
          ? (order.weight.units === "ounces" ? order.weight.value : order.weight.value * 16)
          : null;

        db.prepare(`
          INSERT INTO orders (
            orderId, orderNumber, orderStatus, orderDate, storeId,
            customerEmail, shipToName, shipToCity, shipToState, shipToPostalCode,
            carrierCode, serviceCode, weightValue, orderTotal, shippingAmount,
            items, raw, updatedAt, clientId
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          order.orderId,
          order.orderNumber,
          order.orderStatus,
          order.orderDate,
          storeId,
          order.customerEmail ?? null,
          order.shipTo?.name ?? null,
          order.shipTo?.city ?? null,
          order.shipTo?.state ?? null,
          order.shipTo?.postalCode ?? null,
          order.carrierCode ?? null,
          order.serviceCode ?? null,
          weightOz,
          order.orderTotal ?? 0,
          order.shippingAmount ?? 0,
          JSON.stringify(order.items ?? []),
          JSON.stringify(order),
          Date.now(),
          clientId,
        );

        inserted++;
        console.log(`[sync] Ingested new order: ${order.orderNumber} (orderId=${order.orderId}, client=${clientId}) via ${account.accountName}`);
      }

      page++;
      if (page <= pages) await new Promise((r) => setTimeout(r, 500));
    } while (page <= pages);

    if (accounts.indexOf(account) < accounts.length - 1) {
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }

  return inserted;
}

// ─── Main Worker Class ────────────────────────────────────────────────────────

export class OrderStatusSyncWorker {
  private readonly db: DatabaseSync;
  private readonly mainApiKey: string;
  private readonly mainApiSecret: string;
  private readonly intervalMs: number;
  private readonly lookbackMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    db: DatabaseSync,
    mainApiKey: string,
    mainApiSecret: string,
    intervalMs = 3 * 60 * 1000,    // 3 minutes
    lookbackMs = 4 * 60 * 60 * 1000,  // 4 hour lookback for ingest (catches orders modified up to 4h ago)
  ) {
    this.db = db;
    this.mainApiKey = mainApiKey;
    this.mainApiSecret = mainApiSecret;
    this.intervalMs = intervalMs;
    this.lookbackMs = lookbackMs;
  }

  start(): void {
    if (this.timer) return;
    console.log(`[sync] Order sync worker started (interval=${this.intervalMs / 1000}s)`);
    void this.runSync();
    this.timer = setInterval(() => void this.runSync(), this.intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  async runSync(): Promise<void> {
    if (this.running) {
      console.log("[sync] Previous sync still running, skipping");
      return;
    }
    this.running = true;

    try {
      const accounts = loadAccounts(this.db, this.mainApiKey, this.mainApiSecret);

      // Job 1: Status sync — 2h lookback to catch anything recently shipped
      const statusStart = toISOStringUTC(new Date(Date.now() - 2 * 60 * 60 * 1000));
      const statusUpdated = await runStatusSync(this.db, accounts, statusStart);

      // Job 1b: Cancellation sync — 2h lookback
      const cancelled = await runCancellationSync(this.db, accounts, statusStart);

      // Job 2: Ingest — 30min lookback for new orders
      const ingestStart = toISOStringUTC(new Date(Date.now() - this.lookbackMs));
      const ingested = await runOrderIngest(this.db, accounts, ingestStart);

      if (statusUpdated > 0 || cancelled > 0 || ingested > 0) {
        console.log(`[sync] Cycle complete — ${statusUpdated} marked shipped, ${cancelled} marked cancelled, ${ingested} new orders ingested`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[sync] Cycle error: ${msg}`);
    } finally {
      this.running = false;
    }
  }
}
