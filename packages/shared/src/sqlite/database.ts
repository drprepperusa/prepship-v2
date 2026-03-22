import { DatabaseSync } from "node:sqlite";

export function openSqliteDatabase(filename: string): DatabaseSync {
  const db = new DatabaseSync(filename);
  // Ensure mock_labels table exists (idempotent migration)
  db.exec(`CREATE TABLE IF NOT EXISTS mock_labels (
    shipment_id INTEGER PRIMARY KEY,
    order_number TEXT,
    tracking_number TEXT NOT NULL,
    service_label TEXT,
    weight_oz REAL,
    ship_from TEXT,
    ship_to TEXT,
    ship_date TEXT,
    pdf_base64 TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  )`);
  return db;
}

