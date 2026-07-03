import Database from "@tauri-apps/plugin-sql";
import type { Operation } from "../types";

const DB_URL = "sqlite:fintracker.db";

export async function openDatabase() {
  return Database.load(DB_URL);
}

export async function initializeDatabase() {
  const db = await openDatabase();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      category_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL
    )
  `);
  return db;
}

export async function saveOperation(operation: Operation) {
  const db = await initializeDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO operations
      (id, date, type, status, category_id, account_id, amount, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      operation.id,
      operation.date,
      operation.type,
      operation.status,
      operation.categoryId,
      operation.accountId,
      operation.amount,
      operation.description
    ]
  );
}

