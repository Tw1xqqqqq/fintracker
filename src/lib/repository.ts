import type { Account, Category, Operation } from "../types";
import { categories as seedCategories } from "../data/seed";
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

export async function upsertCategory(category: Category): Promise<void> {
  const db = await openDatabase();
  await db.execute(
    "INSERT OR REPLACE INTO categories (id, name, type, color) VALUES ($1, $2, $3, $4)",
    [category.id, category.name, category.type, category.color]
  );
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await openDatabase();
  await db.execute("DELETE FROM categories WHERE id = $1", [id]);
}

// Сколько операций ссылается на статью — чтобы не удалить используемую.
export async function countOperationsForCategory(id: string): Promise<number> {
  const db = await openDatabase();
  const [{ count }] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM operations WHERE category_id = $1",
    [id]
  );
  return count;
}

export async function upsertAccount(account: Account): Promise<void> {
  const db = await openDatabase();
  await db.execute(
    "INSERT OR REPLACE INTO accounts (id, name, type, balance) VALUES ($1, $2, $3, $4)",
    [account.id, account.name, account.type, account.balance]
  );
}

export async function deleteAccount(id: string): Promise<void> {
  const db = await openDatabase();
  await db.execute("DELETE FROM accounts WHERE id = $1", [id]);
}

// Сколько операций ссылается на счёт — чтобы не удалить используемый.
export async function countOperationsForAccount(id: string): Promise<number> {
  const db = await openDatabase();
  const [{ count }] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM operations WHERE account_id = $1",
    [id]
  );
  return count;
}

// Подсевает набор статей по умолчанию, если справочник статей пуст
// (вызывается при онбординге, чтобы сразу можно было заносить операции).
export async function seedDefaultCategories(): Promise<void> {
  const db = await openDatabase();
  const [{ count }] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM categories"
  );
  if (count > 0) return;

  for (const category of seedCategories) {
    await db.execute("INSERT INTO categories (id, name, type, color) VALUES ($1, $2, $3, $4)", [
      category.id,
      category.name,
      category.type,
      category.color
    ]);
  }
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await openDatabase();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key]
  );
  return rows.length > 0 ? rows[0].value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await openDatabase();
  await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)", [key, value]);
}
