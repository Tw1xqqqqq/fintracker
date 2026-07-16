import type {
  Account,
  Category,
  Operation,
  Reconciliation,
  RecurringRule
} from "../types";
import { categories as seedCategories } from "../data/seed";
import { recurringRuleOccurrences } from "./finance";
import { openDatabase } from "./db";

type OperationRow = {
  id: string;
  date: string;
  type: Operation["type"];
  status: Operation["status"];
  category_id: string | null;
  account_id: string;
  amount: number;
  description: string;
  recurring_id: string | null;
  source_account_id: string | null;
  target_account_id: string | null;
  transfer_id: string | null;
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
    description: row.description,
    recurringId: row.recurring_id,
    sourceAccountId: row.source_account_id,
    targetAccountId: row.target_account_id,
    transferId: row.transfer_id
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
    `SELECT id, date, type, status, category_id, account_id, amount, description,
            recurring_id, source_account_id, target_account_id, transfer_id
       FROM operations
      ORDER BY date DESC`
  );
  return rows.map(mapOperation);
}

export async function upsertOperation(operation: Operation): Promise<void> {
  const db = await openDatabase();

  if (operation.type === "transfer") {
    const sourceAccountId = operation.sourceAccountId;
    const targetAccountId = operation.targetAccountId;
    if (!sourceAccountId || !targetAccountId || sourceAccountId === targetAccountId) {
      throw new Error("Для перевода нужны два разных счёта.");
    }
    const transferId = operation.transferId || operation.id;
    await db.execute("DELETE FROM operations WHERE transfer_id = $1 OR id = $2", [
      transferId,
      operation.id
    ]);
    await db.execute(
      `INSERT INTO operations
         (id, date, type, status, category_id, account_id, amount, description,
          recurring_id, source_account_id, target_account_id, transfer_id)
       VALUES
         ($1,  $2, 'transfer', $3, NULL, $4,  $5, $6, NULL, $7, $8, $9),
         ($10, $2, 'transfer', $3, NULL, $11, $5, $6, NULL, $7, $8, $9)`,
      [
        `${transferId}:out`,
        operation.date,
        operation.status,
        sourceAccountId,
        operation.amount,
        operation.description,
        sourceAccountId,
        targetAccountId,
        transferId,
        `${transferId}:in`,
        targetAccountId
      ]
    );
    return;
  }

  if (!operation.categoryId) throw new Error("Для дохода или расхода нужна категория.");
  if (operation.transferId) {
    await db.execute("DELETE FROM operations WHERE transfer_id = $1", [operation.transferId]);
  }
  await db.execute(
    `INSERT OR REPLACE INTO operations
       (id, date, type, status, category_id, account_id, amount, description,
        recurring_id, source_account_id, target_account_id, transfer_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL, NULL)`,
    [
      operation.id,
      operation.date,
      operation.type,
      operation.status,
      operation.categoryId,
      operation.accountId,
      operation.amount,
      operation.description,
      operation.recurringId ?? null
    ]
  );
}

export async function deleteOperation(id: string): Promise<void> {
  const db = await openDatabase();
  const rows = await db.select<{ transfer_id: string | null }[]>(
    "SELECT transfer_id FROM operations WHERE id = $1",
    [id]
  );
  const transferId = rows[0]?.transfer_id;
  if (transferId) {
    await db.execute("DELETE FROM operations WHERE transfer_id = $1", [transferId]);
  } else {
    await db.execute("DELETE FROM operations WHERE id = $1", [id]);
  }
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
    `SELECT COUNT(*) as count
       FROM operations
      WHERE account_id = $1 OR source_account_id = $1 OR target_account_id = $1`,
    [id]
  );
  return count;
}

type RecurringRuleRow = {
  id: string;
  type: RecurringRule["type"];
  category_id: string;
  account_id: string;
  amount: number;
  recurrence_kind: RecurringRule["recurrenceKind"];
  interval_days: number;
  interval_unit: "day" | "week" | "month" | "year" | null;
  weekdays: string | null;
  monthly_mode: "date" | "weekday" | null;
  start_date: string;
  end_date: string | null;
  occurrence_count: number | null;
  description: string;
};

function mapRecurringRule(row: RecurringRuleRow): RecurringRule {
  return {
    id: row.id,
    type: row.type,
    categoryId: row.category_id,
    accountId: row.account_id,
    amount: row.amount,
    recurrenceKind: row.recurrence_kind,
    intervalDays: row.interval_days,
    intervalUnit: row.interval_unit ?? "day",
    weekdays: row.weekdays
      ? row.weekdays
          .split(",")
          .map((value) => Number(value))
          .filter((value) => value >= 1 && value <= 7)
      : null,
    monthlyMode: row.monthly_mode,
    startDate: row.start_date,
    endDate: row.end_date,
    occurrenceCount: row.occurrence_count,
    description: row.description
  };
}

export async function listRecurringRules(): Promise<RecurringRule[]> {
  const db = await openDatabase();
  const rows = await db.select<RecurringRuleRow[]>(
    `SELECT id, type, category_id, account_id, amount, recurrence_kind, interval_days,
            interval_unit, weekdays, monthly_mode, start_date, end_date, occurrence_count,
            description
       FROM recurring_rules
      ORDER BY start_date`
  );
  return rows.map(mapRecurringRule);
}

export async function upsertRecurringRule(rule: RecurringRule): Promise<void> {
  const db = await openDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO recurring_rules
       (id, type, category_id, account_id, amount, recurrence_kind, interval_days,
        interval_unit, weekdays, monthly_mode, start_date, end_date, occurrence_count,
        description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      rule.id,
      rule.type,
      rule.categoryId,
      rule.accountId,
      rule.amount,
      rule.recurrenceKind,
      rule.intervalDays,
      rule.intervalUnit ?? "day",
      rule.weekdays && rule.weekdays.length > 0 ? rule.weekdays.join(",") : null,
      rule.monthlyMode ?? null,
      rule.startDate,
      rule.endDate,
      rule.occurrenceCount,
      rule.description
    ]
  );
}

export async function deleteRecurringRule(id: string): Promise<void> {
  const db = await openDatabase();
  await db.execute("DELETE FROM recurring_rules WHERE id = $1", [id]);
}

type ReconciliationRow = {
  id: string;
  date: string;
  expected: number;
  actual: number;
  diff: number;
  operation_id: string | null;
  created_at: string;
};

export async function listReconciliations(): Promise<Reconciliation[]> {
  const db = await openDatabase();
  const rows = await db.select<ReconciliationRow[]>(
    `SELECT id, date, expected, actual, diff, operation_id, created_at
       FROM reconciliations
      ORDER BY created_at DESC`
  );
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    expected: row.expected,
    actual: row.actual,
    diff: row.diff,
    operationId: row.operation_id,
    createdAt: row.created_at
  }));
}

export async function saveReconciliation(rec: Reconciliation): Promise<void> {
  const db = await openDatabase();
  await db.execute(
    `INSERT INTO reconciliations (id, date, expected, actual, diff, operation_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [rec.id, rec.date, rec.expected, rec.actual, rec.diff, rec.operationId, rec.createdAt]
  );
}

// Служебная статья для корректирующих операций сверки (создаётся при первом использовании).
export async function ensureAdjustmentCategory(type: "income" | "expense"): Promise<string> {
  const db = await openDatabase();
  const id = type === "income" ? "adjust-income" : "adjust-expense";
  await db.execute(
    "INSERT OR IGNORE INTO categories (id, name, type, color) VALUES ($1, $2, $3, $4)",
    [id, "Корректировка", type, "#737373"]
  );
  return id;
}

function oneYearAfter(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

// Пересобирает плановые операции из правил: удаляет ранее сгенерированные
// (recurring_id IS NOT NULL) и заново раскладывает каждое правило по датам
// повторений до горизонта планирования (settings.endDate или +1 год).
export async function regenerateRecurringOperations(): Promise<void> {
  const db = await openDatabase();
  const rules = await listRecurringRules();
  const horizonSetting = await getSetting("endDate");

  await db.execute("DELETE FROM operations WHERE recurring_id IS NOT NULL");

  for (const rule of rules) {
    // Если конец фин. года раньше старта правила, правило разложилось бы в ноль
    // операций — в этом случае раскладываем на год вперёд от старта правила.
    const horizon =
      horizonSetting && horizonSetting >= rule.startDate
        ? horizonSetting
        : oneYearAfter(rule.startDate);
    const dates = recurringRuleOccurrences(rule, horizon);
    for (const date of dates) {
      await db.execute(
        `INSERT OR REPLACE INTO operations
           (id, date, type, status, category_id, account_id, amount, description, recurring_id)
         VALUES ($1, $2, $3, 'planned', $4, $5, $6, $7, $8)`,
        [
          `rec:${rule.id}:${date}`,
          date,
          rule.type,
          rule.categoryId,
          rule.accountId,
          rule.amount,
          rule.description,
          rule.id
        ]
      );
    }
  }
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
