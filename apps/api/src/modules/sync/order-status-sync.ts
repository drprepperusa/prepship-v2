/**
 * Order Status Sync Worker
 *
 * Polls ShipStation v1 API every 5 minutes for orders whose status has
 * changed to "shipped" since the last check, then updates our local DB.
 *
 * Supports multiple SS accounts (main + KFG).
 * Runs as a background loop started from bootstrap when WORKER_SYNC_ENABLED=true.
 */

import type { DatabaseSync } from "node:sqlite";

interface SyncAccount {
  clientId: number;
  accountName: string;
  apiKey: string;
  apiSecret: string;
}

interface SSOrder {
  orderId: number;
  orderNumber: string;
  orderStatus: string;
  modifyDate: string;
}

function basicAuth(apiKey: string, apiSecret: string): string {
  return "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
}

function toISOStringUTC(date: Date): string {
  // ShipStation expects UTC ISO string without milliseconds
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function fetchShippedOrders(
  account: SyncAccount,
  modifyDateStart: string,
  page = 1,
): Promise<{ orders: SSOrder[]; pages: number }> {
  const params = new URLSearchParams({
    orderStatus: "shipped",
    modifyDateStart,
    pageSize: "500",
    page: String(page),
  });

  const url = `https://ssapi.shipstation.com/orders?${params.toString()}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: basicAuth(account.apiKey, account.apiSecret),
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (resp.status === 429) {
    // Rate limited — ShipStation allows 40 req/min. Back off.
    const retryAfter = Number(resp.headers.get("X-Rate-Limit-Reset") ?? "10");
    console.warn(`[sync] Rate limited on ${account.accountName}, waiting ${retryAfter}s`);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return fetchShippedOrders(account, modifyDateStart, page);
  }

  if (!resp.ok) {
    throw new Error(`ShipStation API error: ${resp.status} for account ${account.accountName}`);
  }

  const data = await resp.json() as { orders?: SSOrder[]; pages?: number };
  return {
    orders: data.orders ?? [],
    pages: data.pages ?? 1,
  };
}

async function syncAccountOrders(
  db: DatabaseSync,
  account: SyncAccount,
  modifyDateStart: string,
): Promise<number> {
  let updated = 0;
  let page = 1;
  let pages = 1;

  do {
    const result = await fetchShippedOrders(account, modifyDateStart, page);
    pages = result.pages;

    for (const order of result.orders) {
      if (!order.orderNumber || order.orderStatus !== "shipped") continue;

      // Match on orderNumber (SS source of truth) — orderId may differ due to SS duplicates
      const existing = db.prepare(`
        SELECT orderId, orderStatus FROM orders WHERE orderNumber = ? AND orderStatus = 'awaiting_shipment' LIMIT 1
      `).get(order.orderNumber) as { orderId: number; orderStatus: string } | undefined;

      if (!existing) continue; // Not in our DB or already correct

      // Mark as shipped — SS says it shipped, we trust SS
      const now = Date.now();
      db.prepare(`
        UPDATE orders SET orderStatus = 'shipped', updatedAt = ? WHERE orderId = ?
      `).run(now, existing.orderId);

      // Also update order_local if exists
      db.prepare(`
        UPDATE order_local SET external_shipped = 1, updatedAt = ? WHERE orderId = ?
      `).run(now, existing.orderId);

      updated++;
      console.log(`[sync] Marked shipped: ${order.orderNumber} (our orderId=${existing.orderId}) via ${account.accountName}`);
    }

    page++;

    // Small delay between pages to respect rate limits
    if (page <= pages) {
      await new Promise((r) => setTimeout(r, 500));
    }
  } while (page <= pages);

  return updated;
}

function loadAccounts(db: DatabaseSync, mainApiKey: string, mainApiSecret: string): SyncAccount[] {
  const accounts: SyncAccount[] = [];

  // Main account (from secrets.json — always include)
  if (mainApiKey && mainApiSecret) {
    accounts.push({
      clientId: 1,
      accountName: "main",
      apiKey: mainApiKey,
      apiSecret: mainApiSecret,
    });
  }

  // Additional accounts from clients table
  const rows = db.prepare(`
    SELECT clientId, name, ss_api_key, ss_api_secret
    FROM clients
    WHERE active = 1 AND ss_api_key IS NOT NULL AND ss_api_key != ''
  `).all() as Array<{ clientId: number; name: string; ss_api_key: string; ss_api_secret: string }>;

  for (const row of rows) {
    if (row.ss_api_key && row.ss_api_secret) {
      accounts.push({
        clientId: row.clientId,
        accountName: row.name,
        apiKey: row.ss_api_key,
        apiSecret: row.ss_api_secret,
      });
    }
  }

  return accounts;
}

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
    intervalMs = 5 * 60 * 1000,  // 5 minutes
    lookbackMs = 2 * 60 * 60 * 1000, // 2 hour lookback
  ) {
    this.db = db;
    this.mainApiKey = mainApiKey;
    this.mainApiSecret = mainApiSecret;
    this.intervalMs = intervalMs;
    this.lookbackMs = lookbackMs;
  }

  start(): void {
    if (this.timer) return;
    console.log(`[sync] Order status sync worker started (interval=${this.intervalMs / 1000}s, lookback=${this.lookbackMs / 3600000}h)`);

    // Run immediately on start, then on interval
    void this.runSync();
    this.timer = setInterval(() => void this.runSync(), this.intervalMs);
    // Don't keep process alive just for this
    if (this.timer.unref) this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runSync(): Promise<void> {
    if (this.running) {
      console.log("[sync] Previous sync still running, skipping this cycle");
      return;
    }
    this.running = true;

    try {
      const modifyDateStart = toISOStringUTC(new Date(Date.now() - this.lookbackMs));
      const accounts = loadAccounts(this.db, this.mainApiKey, this.mainApiSecret);
      let totalUpdated = 0;

      for (const account of accounts) {
        try {
          const updated = await syncAccountOrders(this.db, account, modifyDateStart);
          totalUpdated += updated;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[sync] Error syncing account ${account.accountName}: ${msg}`);
        }
        // 2s delay between accounts
        if (accounts.indexOf(account) < accounts.length - 1) {
          await new Promise((r) => setTimeout(r, 2_000));
        }
      }

      if (totalUpdated > 0) {
        console.log(`[sync] Sync complete — updated ${totalUpdated} order(s) to shipped`);
      }
    } finally {
      this.running = false;
    }
  }
}
