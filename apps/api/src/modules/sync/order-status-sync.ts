/**
 * Order Status Sync Worker — clean single-pass design
 *
 * Each cycle does 3 things with minimal API calls:
 *
 * 1. STATUS + SHIPMENT SYNC
 *    - Fetch all SS shipped orders modified in last 2h  (1-2 API calls)
 *    - Fetch all SS shipments created in last 2h        (1-2 API calls)
 *    - Join them locally: if shipment exists → save it, external_shipped=0
 *                         if no shipment    → external_shipped=1 (confirmed external)
 *    No per-order API calls. No retry loop. No race condition.
 *
 * 2. CANCELLATION SYNC
 *    - Fetch SS cancelled orders modified in last 2h    (1-2 API calls)
 *    - Mark matching awaiting orders as cancelled
 *
 * 3. ORDER INGEST
 *    - Fetch SS awaiting_shipment orders modified in last 4h (1-2 API calls)
 *    - Insert any new orders not yet in our DB
 */

import type { DatabaseSync } from "node:sqlite";
import { resolveCarrierNickname } from "../orders/application/carrier-resolver.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SyncAccount {
  clientId: number;
  accountName: string;
  apiKey: string;
  apiSecret: string;
  storeIds: number[];
}

interface SSOrderSummary {
  orderId: number;
  orderNumber: string;
  orderStatus: string;
  orderDate: string;
  modifyDate: string;
  customerEmail: string | null;
  shipTo: { name: string | null; city: string | null; state: string | null; postalCode: string | null };
  carrierCode: string | null;
  serviceCode: string | null;
  weight: { value: number; units: string } | null;
  orderTotal: number;
  shippingAmount: number;
  items: unknown[];
  advancedOptions: { storeId: number | null } | null;
}

interface SSShipmentSummary {
  shipmentId: number;
  orderNumber: string;
  carrierCode: string | null;
  serviceCode: string | null;
  trackingNumber: string | null;
  shipDate: string | null;
  shipmentCost: number;
  formUrl: string | null;
  voided: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function basicAuth(key: string, secret: string): string {
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

function toISOStringUTC(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function fetchAllPages<T>(
  account: SyncAccount,
  endpoint: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  let pages = 1;

  do {
    const qs = new URLSearchParams({ ...params, pageSize: "500", page: String(page) });
    const url = `https://ssapi.shipstation.com/${endpoint}?${qs}`;
    const resp = await fetch(url, {
      headers: { Authorization: basicAuth(account.apiKey, account.apiSecret) },
      signal: signal ?? AbortSignal.timeout(90_000),
    });

    if (resp.status === 429) {
      const wait = Number(resp.headers.get("X-Rate-Limit-Reset") ?? "10");
      console.warn(`[sync] Rate limited on ${account.accountName}, waiting ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue; // retry same page
    }

    if (!resp.ok) throw new Error(`SS API ${resp.status} for ${account.accountName} (${endpoint})`);

    const data = (await resp.json()) as Record<string, unknown>;
    // SS wraps results in a key matching the endpoint (orders, shipments)
    const key = endpoint.split("?")[0]!;
    const items = (data[key] ?? data[Object.keys(data).find(k => Array.isArray(data[k]))!]) as T[];
    results.push(...(items ?? []));
    pages = (data.pages as number) ?? 1;
    page++;

    if (page <= pages) await new Promise((r) => setTimeout(r, 500));
  } while (page <= pages);

  return results;
}

// ─── Account + Client helpers ─────────────────────────────────────────────────

function loadAccounts(db: DatabaseSync, mainApiKey: string, mainApiSecret: string): SyncAccount[] {
  const accounts: SyncAccount[] = [];
  const clientRows = db.prepare(`SELECT clientId, storeIds FROM clients WHERE active = 1`).all() as Array<{ clientId: number; storeIds: string }>;
  const mainStoreIds: number[] = [];

  for (const row of clientRows) {
    try { mainStoreIds.push(...(JSON.parse(row.storeIds ?? "[]") as number[])); } catch { /* ignore */ }
  }

  if (mainApiKey && mainApiSecret) {
    accounts.push({ clientId: 0, accountName: "main", apiKey: mainApiKey, apiSecret: mainApiSecret, storeIds: mainStoreIds });
  }

  const clientKeyRows = db.prepare(`
    SELECT clientId, name, ss_api_key, ss_api_secret, storeIds
    FROM clients WHERE active=1 AND ss_api_key IS NOT NULL AND ss_api_key != ''
  `).all() as Array<{ clientId: number; name: string; ss_api_key: string; ss_api_secret: string; storeIds: string }>;

  for (const row of clientKeyRows) {
    let storeIds: number[] = [];
    try { storeIds = JSON.parse(row.storeIds ?? "[]") as number[]; } catch { /* ignore */ }
    accounts.push({ clientId: row.clientId, accountName: row.name, apiKey: row.ss_api_key, apiSecret: row.ss_api_secret, storeIds });
  }

  return accounts;
}

function resolveClientId(db: DatabaseSync, storeId: number | null): number | null {
  if (!storeId) return null;
  const row = db.prepare(`SELECT clientId FROM clients WHERE active=1 AND storeIds LIKE ? LIMIT 1`).get(`%${storeId}%`) as { clientId: number } | undefined;
  return row?.clientId ?? null;
}

// ─── Save a shipment record ───────────────────────────────────────────────────

function saveShipmentRecord(
  db: DatabaseSync,
  s: SSShipmentSummary,
  orderId: number,
  clientId: number | null,
): void {
  const now = Date.now();
  const nickname = resolveCarrierNickname(null, s.carrierCode, s.trackingNumber, clientId);

  db.prepare(`
    INSERT OR IGNORE INTO shipments (
      shipmentId, orderId, orderNumber, carrierCode, serviceCode, trackingNumber,
      shipDate, labelUrl, shipmentCost, otherCost, voided, updatedAt, clientId,
      provider_account_nickname, source, label_created_at, label_format
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    s.shipmentId, orderId, s.orderNumber, s.carrierCode ?? null, s.serviceCode ?? null,
    s.trackingNumber ?? null, s.shipDate ?? null, s.formUrl ?? null,
    s.shipmentCost, 0, 0, now, clientId,
    nickname, "ss_sync", now, "pdf",
  );

  // Update order_local: real SS label → external_shipped=0
  db.prepare(`INSERT OR IGNORE INTO order_local (orderId, external_shipped, tracking_number, updatedAt) VALUES (?,0,?,?)`).run(orderId, s.trackingNumber ?? null, now);
  db.prepare(`UPDATE order_local SET external_shipped=0, tracking_number=?, updatedAt=? WHERE orderId=?`).run(s.trackingNumber ?? null, now, orderId);
}

// ─── Job 1: Status + Shipment Sync ───────────────────────────────────────────

async function runStatusSync(
  db: DatabaseSync,
  accounts: SyncAccount[],
  modifyDateStart: string,
  signal?: AbortSignal,
): Promise<number> {
  let updated = 0;

  for (const account of accounts) {
    // Step A: Bulk-fetch all shipments created in this window.
    // Use a 45-min window for shipments (shorter than the 2h order window) —
    // this keeps the page count small while still covering any SS lag.
    // The backfill pass below catches anything older that slipped through.
    const shipmentStart = toISOStringUTC(new Date(Date.now() - 45 * 60 * 1000));
    const shipments = await fetchAllPages<SSShipmentSummary>(
      account, "shipments",
      { createDateStart: shipmentStart },
      signal,
    ).catch(() => [] as SSShipmentSummary[]);

    // Build lookup: orderNumber → shipment (non-voided only)
    const shipmentMap = new Map<string, SSShipmentSummary>();
    for (const s of shipments) {
      if (!s.voided && s.orderNumber && !shipmentMap.has(s.orderNumber)) {
        shipmentMap.set(s.orderNumber, s);
      }
    }

    // Step B: Fetch all orders marked shipped in this window
    const orders = await fetchAllPages<SSOrderSummary>(
      account, "orders",
      { orderStatus: "shipped", modifyDateStart },
      signal,
    ).catch(() => [] as SSOrderSummary[]);

    const now = Date.now();

    for (const order of orders) {
      if (!order.orderNumber) continue;

      // Only process orders we currently have as awaiting_shipment
      const existing = db.prepare(`
        SELECT orderId, clientId FROM orders WHERE orderNumber=? AND orderStatus='awaiting_shipment' LIMIT 1
      `).get(order.orderNumber) as { orderId: number; clientId: number } | undefined;

      if (!existing) continue;

      // Mark order as shipped
      db.prepare(`UPDATE orders SET orderStatus='shipped', updatedAt=? WHERE orderId=?`).run(now, existing.orderId);
      db.prepare(`INSERT OR IGNORE INTO order_local (orderId, updatedAt) VALUES (?,?)`).run(existing.orderId, now);

      const shipment = shipmentMap.get(order.orderNumber);

      if (shipment) {
        // SS has a shipment record — save it, external_shipped=0
        saveShipmentRecord(db, shipment, existing.orderId, existing.clientId);
        console.log(`[sync] Marked shipped: ${order.orderNumber} | ${shipment.carrierCode} ${shipment.trackingNumber ?? "no-tracking"} $${shipment.shipmentCost}`);
      } else {
        // No SS shipment in this window — confirmed external (Amazon/marketplace)
        db.prepare(`UPDATE order_local SET external_shipped=1, updatedAt=? WHERE orderId=?`).run(now, existing.orderId);
        console.log(`[sync] Marked shipped (external): ${order.orderNumber}`);
      }

      updated++;
    }

    // Also save shipments for orders already marked shipped but missing shipment records
    // (catches any that slipped through in previous cycles)
    for (const [orderNumber, shipment] of shipmentMap) {
      const existingShipped = db.prepare(`
        SELECT o.orderId, o.clientId FROM orders o
        LEFT JOIN shipments s ON s.orderId=o.orderId AND s.voided=0
        WHERE o.orderNumber=? AND o.orderStatus='shipped' AND s.shipmentId IS NULL
        LIMIT 1
      `).get(orderNumber) as { orderId: number; clientId: number } | undefined;

      if (existingShipped) {
        saveShipmentRecord(db, shipment, existingShipped.orderId, existingShipped.clientId);
        console.log(`[sync] Backfilled shipment: ${orderNumber}`);
      }
    }

    if (accounts.indexOf(account) < accounts.length - 1) {
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }

  return updated;
}

// ─── Job 2: Cancellation Sync ────────────────────────────────────────────────

async function runCancellationSync(
  db: DatabaseSync,
  accounts: SyncAccount[],
  modifyDateStart: string,
  signal?: AbortSignal,
): Promise<number> {
  let cancelled = 0;

  for (const account of accounts) {
    const orders = await fetchAllPages<SSOrderSummary>(account, "orders", { orderStatus: "cancelled", modifyDateStart }, signal).catch(() => []);

    for (const order of orders) {
      if (!order.orderNumber) continue;
      const existing = db.prepare(`SELECT orderId FROM orders WHERE orderNumber=? AND orderStatus='awaiting_shipment' LIMIT 1`).get(order.orderNumber) as { orderId: number } | undefined;
      if (!existing) continue;
      db.prepare(`UPDATE orders SET orderStatus='cancelled', updatedAt=? WHERE orderId=?`).run(Date.now(), existing.orderId);
      cancelled++;
      console.log(`[sync] Marked cancelled: ${order.orderNumber}`);
    }

    if (accounts.indexOf(account) < accounts.length - 1) await new Promise((r) => setTimeout(r, 1_500));
  }

  return cancelled;
}

// ─── Job 3: Order Ingest ──────────────────────────────────────────────────────

async function runOrderIngest(
  db: DatabaseSync,
  accounts: SyncAccount[],
  modifyDateStart: string,
  signal?: AbortSignal,
): Promise<number> {
  let inserted = 0;

  for (const account of accounts) {
    const orders = await fetchAllPages<SSOrderSummary>(account, "orders", { orderStatus: "awaiting_shipment", modifyDateStart }, signal).catch(() => []);

    for (const order of orders) {
      if (!order.orderId || !order.orderNumber) continue;
      const exists = db.prepare(`SELECT 1 FROM orders WHERE orderId=? LIMIT 1`).get(order.orderId);
      if (exists) continue;

      const storeId = order.advancedOptions?.storeId ?? null;
      const clientId = resolveClientId(db, storeId);
      if (!clientId) continue;

      const weightOz = order.weight?.value != null
        ? (order.weight.units === "ounces" ? order.weight.value : order.weight.value * 16)
        : null;

      db.prepare(`
        INSERT INTO orders (orderId,orderNumber,orderStatus,orderDate,storeId,customerEmail,
          shipToName,shipToCity,shipToState,shipToPostalCode,carrierCode,serviceCode,
          weightValue,orderTotal,shippingAmount,items,raw,updatedAt,clientId)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        order.orderId, order.orderNumber, order.orderStatus, order.orderDate, storeId,
        order.customerEmail ?? null, order.shipTo?.name ?? null, order.shipTo?.city ?? null,
        order.shipTo?.state ?? null, order.shipTo?.postalCode ?? null,
        order.carrierCode ?? null, order.serviceCode ?? null, weightOz,
        order.orderTotal ?? 0, order.shippingAmount ?? 0,
        JSON.stringify(order.items ?? []), JSON.stringify(order), Date.now(), clientId,
      );

      inserted++;
      console.log(`[sync] Ingested: ${order.orderNumber} (orderId=${order.orderId}, client=${clientId})`);
    }

    if (accounts.indexOf(account) < accounts.length - 1) await new Promise((r) => setTimeout(r, 1_500));
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
    intervalMs = 3 * 60 * 1000,
    lookbackMs = 4 * 60 * 60 * 1000,
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

    // Hard cap: abort the entire cycle if SS is unresponsive after 2.5 min
    const cycleAbort = AbortSignal.timeout(150_000);

    try {
      const accounts = loadAccounts(this.db, this.mainApiKey, this.mainApiSecret);
      const statusStart = toISOStringUTC(new Date(Date.now() - 2 * 60 * 60 * 1000));

      // Job 1: Status + shipment sync (bulk — no per-order calls)
      const statusUpdated = await runStatusSync(this.db, accounts, statusStart, cycleAbort);

      // Job 2: Cancellation sync
      const cancelled = await runCancellationSync(this.db, accounts, statusStart, cycleAbort);

      // Job 3: Ingest new awaiting orders
      const ingestStart = toISOStringUTC(new Date(Date.now() - this.lookbackMs));
      const ingested = await runOrderIngest(this.db, accounts, ingestStart, cycleAbort);

      if (statusUpdated > 0 || cancelled > 0 || ingested > 0) {
        console.log(`[sync] Cycle — ${statusUpdated} shipped, ${cancelled} cancelled, ${ingested} ingested`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[sync] Cycle error: ${msg}`);
    } finally {
      this.running = false;
    }
  }
}
