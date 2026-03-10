import { DatabaseSync } from "node:sqlite";

export function openSqliteDatabase(filename: string): DatabaseSync {
  return new DatabaseSync(filename);
}

