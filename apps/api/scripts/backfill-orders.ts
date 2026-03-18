#!/usr/bin/env node
/**
 * Order Backfill Script
 * Reads all existing V2 orders from prepship.db and writes them with source_system='v2' marker
 * to validate they can coexist with V3 orders.
 *
 * Usage:
 *   npx ts-node scripts/backfill-orders.ts [--dry-run] [--db-path ./prepship.db]
 */

import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

interface BackfillOptions {
  dryRun: boolean;
  dbPath: string;
}

interface ValidationResult {
  totalOrders: number;
  duplicateIds: number[];
  nullCriticalFields: Array<{ orderId: number; field: string }>;
  isValid: boolean;
}

interface OrderRow {
  orderId: number;
  clientId: number | null;
  orderNumber: string | null;
  orderStatus: string;
  storeId: number | null;
  customerEmail: string | null;
  shipToName: string | null;
  shipToCity: string | null;
  shipToState: string | null;
  shipToPostalCode: string | null;
  items: string;
  raw: string;
  orderDate: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
}

interface BackfillStateRow {
  status: "pending" | "in_progress" | "complete";
  startedAt: number;
  completedAt: number | null;
  ordersProcessed: number;
  errors: string | null;
}

class OrderBackfillService {
  private db: DatabaseSync;
  private options: BackfillOptions;
  private processedCount = 0;
  private errors: string[] = [];

  constructor(options: BackfillOptions) {
    this.options = options;
    this.db = new DatabaseSync(options.dbPath);
  }

  /**
   * Ensures backfill_state table exists
   */
  private ensureBackfillStateTable(): void {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS backfill_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'complete')),
          startedAt INTEGER NOT NULL,
          completedAt INTEGER,
          ordersProcessed INTEGER NOT NULL DEFAULT 0,
          errors TEXT
        );
      `);
    } catch (error) {
      this.logError(`Failed to create backfill_state table: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Ensures orders table has source_system column
   */
  private ensureSourceSystemColumn(): void {
    try {
      // Check if orders table exists
      const tables = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='orders'
      `).all() as Array<{ name: string }>;

      if (tables.length === 0) {
        this.log("Orders table does not exist yet - will be created on first sync");
        return;
      }

      // Check if column exists
      const result = this.db.prepare(`
        PRAGMA table_info(orders)
      `).all() as Array<{ name: string }>;

      const hasSourceSystem = result.some((col) => col.name === "source_system");

      if (!hasSourceSystem) {
        this.db.exec(`
          ALTER TABLE orders ADD COLUMN source_system TEXT DEFAULT 'v2';
        `);
        this.log("Added source_system column to orders table");
      }
    } catch (error) {
      this.logError(`Failed to ensure source_system column: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Gets all orders from the database
   */
  private getAllOrders(): OrderRow[] {
    try {
      // Check if orders table exists
      const tables = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='orders'
      `).all() as Array<{ name: string }>;

      if (tables.length === 0) {
        return [];
      }

      const rows = this.db.prepare(`
        SELECT
          o.orderId,
          o.clientId,
          o.orderNumber,
          o.orderStatus,
          o.storeId,
          o.customerEmail,
          o.shipToName,
          o.shipToCity,
          o.shipToState,
          o.shipToPostalCode,
          o.items,
          o.raw,
          o.orderDate,
          o.carrierCode,
          o.serviceCode
        FROM orders o
        ORDER BY o.orderId
      `).all() as OrderRow[];

      return rows;
    } catch (error) {
      this.logError(`Failed to fetch orders: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Validates order data for critical issues
   */
  private validateOrders(orders: OrderRow[]): ValidationResult {
    const result: ValidationResult = {
      totalOrders: orders.length,
      duplicateIds: [],
      nullCriticalFields: [],
      isValid: true,
    };

    const seenIds = new Set<number>();
    const criticalFields: (keyof OrderRow)[] = ["orderId", "orderStatus"];

    for (const order of orders) {
      // Check for duplicates
      if (seenIds.has(order.orderId)) {
        result.duplicateIds.push(order.orderId);
        result.isValid = false;
      }
      seenIds.add(order.orderId);

      // Check for nulls in critical fields
      for (const field of criticalFields) {
        if (order[field] === null || order[field] === undefined) {
          result.nullCriticalFields.push({
            orderId: order.orderId,
            field,
          });
          result.isValid = false;
        }
      }
    }

    return result;
  }

  /**
   * Updates orders with source_system marker
   */
  private updateOrdersWithSourceSystem(orders: OrderRow[]): number {
    const update = this.db.prepare(`
      UPDATE orders
      SET source_system = ?
      WHERE orderId = ?
    `);

    let updated = 0;

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];

      try {
        const result = update.run("v2", order.orderId);
        updated++;

        // Log progress every 50 orders
        if ((i + 1) % 50 === 0) {
          this.log(`Processed ${i + 1}/${orders.length} orders`);
        }
      } catch (error) {
        this.logError(`Failed to update order ${order.orderId}: ${error instanceof Error ? error.message : String(error)}`);
        this.errors.push(`Order ${order.orderId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return updated;
  }

  /**
   * Updates backfill_state table with completion status
   */
  private updateBackfillState(status: "pending" | "in_progress" | "complete", ordersProcessed: number, errors?: string[]): void {
    try {
      const now = Date.now();
      const errorJson = errors && errors.length > 0 ? JSON.stringify(errors) : null;

      const existing = this.db.prepare(`
        SELECT * FROM backfill_state WHERE id = 1
      `).get() as BackfillStateRow | undefined;

      if (!existing) {
        this.db.prepare(`
          INSERT INTO backfill_state (id, status, startedAt, ordersProcessed, errors)
          VALUES (1, ?, ?, ?, ?)
        `).run(status, now, ordersProcessed, errorJson);
      } else {
        const completedAt = status === "complete" ? now : null;
        this.db.prepare(`
          UPDATE backfill_state
          SET status = ?, completedAt = ?, ordersProcessed = ?, errors = ?
          WHERE id = 1
        `).run(status, completedAt, ordersProcessed, errorJson);
      }
    } catch (error) {
      this.logError(`Failed to update backfill_state: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Main backfill process
   */
  async run(): Promise<void> {
    this.log("Starting order backfill process...");
    this.log(`Database: ${this.options.dbPath}`);
    this.log(`Dry-run: ${this.options.dryRun}`);

    // Validate database exists
    if (!existsSync(this.options.dbPath)) {
      this.logError(`Database file not found: ${this.options.dbPath}`);
      process.exit(1);
    }

    try {
      // Ensure tables exist
      this.ensureBackfillStateTable();
      this.ensureSourceSystemColumn();

      // Update backfill state to in_progress
      if (!this.options.dryRun) {
        this.updateBackfillState("in_progress", 0);
      }

      // Fetch all orders
      const orders = this.getAllOrders();
      this.log(`Found ${orders.length} orders in database`);

      if (orders.length === 0) {
        this.log("No orders to backfill");
        if (!this.options.dryRun) {
          this.updateBackfillState("complete", 0);
        }
        return;
      }

      // Validate orders
      const validation = this.validateOrders(orders);
      this.log(`\nValidation Results:`);
      this.log(`  Total orders: ${validation.totalOrders}`);
      this.log(`  Duplicate IDs: ${validation.duplicateIds.length}`);
      this.log(`  Null critical fields: ${validation.nullCriticalFields.length}`);
      this.log(`  Valid: ${validation.isValid}`);

      if (!validation.isValid) {
        this.logError("\nValidation failed. Details:");
        if (validation.duplicateIds.length > 0) {
          this.logError(`  Duplicate IDs: ${validation.duplicateIds.join(", ")}`);
        }
        if (validation.nullCriticalFields.length > 0) {
          validation.nullCriticalFields.forEach((issue) => {
            this.logError(`  Order ${issue.orderId}: null in ${issue.field}`);
          });
        }
      }

      // Show what would be updated
      if (this.options.dryRun) {
        this.log(`\n[DRY-RUN] Would update ${orders.length} orders with source_system='v2'`);
        this.log("[DRY-RUN] First 5 orders:");
        orders.slice(0, 5).forEach((order) => {
          this.log(`  Order ${order.orderId}: ${order.orderNumber} (status: ${order.orderStatus})`);
        });
        if (orders.length > 5) {
          this.log(`  ... and ${orders.length - 5} more`);
        }
      } else {
        // Execute backfill
        this.log(`\nBackfilling ${orders.length} orders with source_system='v2'...`);
        const updated = this.updateOrdersWithSourceSystem(orders);
        this.processedCount = updated;

        this.log(`\nBackfill complete: ${updated}/${orders.length} orders updated`);

        if (this.errors.length > 0) {
          this.logError(`\nErrors encountered (${this.errors.length}):`);
          this.errors.slice(0, 10).forEach((err) => this.logError(`  ${err}`));
          if (this.errors.length > 10) {
            this.logError(`  ... and ${this.errors.length - 10} more`);
          }
        }

        // Update backfill state to complete
        this.updateBackfillState("complete", updated, this.errors);
      }

      this.log("\n✓ Process completed successfully");
    } catch (error) {
      this.logError(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
      if (!this.options.dryRun) {
        this.updateBackfillState("pending", this.processedCount, [
          error instanceof Error ? error.message : String(error),
        ]);
      }
      process.exit(1);
    } finally {
      this.db.close();
    }
  }

  private log(message: string): void {
    console.log(message);
  }

  private logError(message: string): void {
    console.error(message);
  }
}

// Parse command line arguments
function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    dryRun: false,
    dbPath: "./prepship.db",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--db-path" && args[i + 1]) {
      options.dbPath = resolve(args[i + 1]);
      i++;
    }
  }

  return options;
}

// Entry point
const options = parseArgs();
const service = new OrderBackfillService(options);
service.run().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
