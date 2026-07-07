import type { Account, Category, Operation } from "../types";
import {
  accounts as seedAccounts,
  categories as seedCategories,
  operations as seedOperations
} from "../data/seed";
import { openDatabase } from "./db";

type OperationRow = {
  id: string;
  date: string;
  type: Operation["type"];
  status: Operation["status"];
  category_id: string;
  account_id: string;
  amount: number;
  description: string;
};

function mapOperation(row: OperationRow): Operation {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    status: row.status,
    categoryId: row.category_id,
    accountId: row.account_id,
    amount: row.amount,
    description: row.description
  };
}

export async function listAccounts(): Promise<Account[]> {
  const db = await openDatabase();
  return db.select<Account[]>("SELECT id, name, type, balance FROM accounts ORDER BY name");
}

export async function listCategories(): Promise<Category[]> {
  const db = await openDatabase();
  return db.select<Category[]>("SELECT id, name, type, color FROM categories ORDER BY name");
}

export async function listOperations(): Promise<Operation[]> {
  const db = await openDatabase();
  const rows = await db.select<OperationRow[]>(
    `SELECT id, date, type, status, category_id, account_id, amount, description
       FROM operations
      ORDER BY date DESC`
  );
  return rows.map(mapOperation);
}

export async function upsertOperation(operation: Operation): Promise<void> {
  const db = await openDatabase();
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

export async function deleteOperation(id: string): Promise<void> {
  const db = await openDatabase();
  await db.execute("DELETE FROM operations WHERE id = $1", [id]);
}

// Загружает демо-данные из seed при первом запуске (пустая БД).
export async function seedIfEmpty(): Promise<void> {
  const db = await openDatabase();
  const [{ count }] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM accounts"
  );
  if (count > 0) return;

  for (const account of seedAccounts) {
    await db.execute("INSERT INTO accounts (id, name, type, balance) VALUES ($1, $2, $3, $4)", [
      account.id,
      account.name,
      account.type,
      account.balance
    ]);
  }
  for (const category of seedCategories) {
    await db.execute("INSERT INTO categories (id, name, type, color) VALUES ($1, $2, $3, $4)", [
      category.id,
      category.name,
      category.type,
      category.color
    ]);
  }
  for (const operation of seedOperations) {
    await upsertOperation(operation);
  }
}
