import type {
  Account,
  Category,
  Operation,
  Reconciliation,
  RecurringRule
} from "../types";
import { categories as seedCategories } from "../data/seed";
import {
  editedOccurrenceId,
  occurrencesToGenerate,
  parseRecurringOccurrenceId,
  recurringRuleOccurrences
} from "./finance";
import { newId, todayIso } from "./dates";
import { openDatabase } from "./db";
import type { Usage } from "./usage";

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

// Импорт выписки: уже импортированные операции (тот же id) не трогаем,
// чтобы повторный импорт не затирал поправленные вручную статьи.
// Возвращает, сколько операций добавлено и сколько пропущено как дубли.
export async function insertImportedOperations(
  operations: Operation[]
): Promise<{ inserted: number; duplicates: number }> {
  const db = await openDatabase();
  let inserted = 0;
  for (const operation of operations) {
    const result = await db.execute(
      `INSERT OR IGNORE INTO operations
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
    inserted += result.rowsAffected;
  }
  return { inserted, duplicates: operations.length - inserted };
}

// Помечает вхождение регулярного правила как изменённое вручную —
// перегенерация его больше не создаёт.
async function addRecurringException(ruleId: string, date: string): Promise<void> {
  const db = await openDatabase();
  await db.execute(
    "INSERT OR IGNORE INTO recurring_exceptions (rule_id, date) VALUES ($1, $2)",
    [ruleId, date]
  );
}

// Правка одного вхождения регулярного правила: исходное вхождение уходит в
// исключения, а правка сохраняется под своим id (rec-edit:…), который
// перегенерация не трогает. Перевод теряет связь с правилом и получает новый id.
export async function updateRecurringOccurrence(
  original: Operation,
  edited: Operation
): Promise<void> {
  const occurrence = parseRecurringOccurrenceId(original.id);
  if (!occurrence) {
    await upsertOperation(edited);
    return;
  }
  const db = await openDatabase();
  await addRecurringException(occurrence.ruleId, occurrence.date);
  await db.execute("DELETE FROM operations WHERE id = $1", [original.id]);
  if (edited.type === "transfer") {
    await upsertOperation({ ...edited, id: newId("op"), transferId: null, recurringId: null });
    return;
  }
  await upsertOperation({
    ...edited,
    id: editedOccurrenceId(occurrence),
    recurringId: occurrence.ruleId
  });
}

export async function deleteOperation(id: string): Promise<void> {
  const db = await openDatabase();
  // Удалённое вхождение регулярного правила не должно вернуться при перегенерации.
  const occurrence = parseRecurringOccurrenceId(id);
  if (occurrence) await addRecurringException(occurrence.ruleId, occurrence.date);
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

// Сколько операций и регулярных правил ссылается на статью.
export async function categoryUsage(id: string): Promise<Usage> {
  const db = await openDatabase();
  const [{ operations, rules }] = await db.select<Usage[]>(
    `SELECT (SELECT COUNT(*) FROM operations WHERE category_id = $1) AS operations,
            (SELECT COUNT(*) FROM recurring_rules WHERE category_id = $1) AS rules`,
    [id]
  );
  return { operations, rules };
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

// Сколько операций (включая ноги переводов) и регулярных правил ссылается на счёт.
export async function accountUsage(id: string): Promise<Usage> {
  const db = await openDatabase();
  const [{ operations, rules }] = await db.select<Usage[]>(
    `SELECT (SELECT COUNT(*)
               FROM operations
              WHERE account_id = $1 OR source_account_id = $1 OR target_account_id = $1) AS operations,
            (SELECT COUNT(*) FROM recurring_rules WHERE account_id = $1) AS rules`,
    [id]
  );
  return { operations, rules };
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

// Удаление правила убирает его будущие вхождения (в том числе отредактированные);
// прошлые остаются в плане как история.
export async function deleteRecurringRule(id: string, today = todayIso()): Promise<void> {
  const db = await openDatabase();
  await db.execute("DELETE FROM recurring_rules WHERE id = $1", [id]);
  await db.execute("DELETE FROM operations WHERE recurring_id = $1 AND date >= $2", [id, today]);
  await db.execute("DELETE FROM recurring_exceptions WHERE rule_id = $1", [id]);
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

// Пересобирает плановые операции из правил до горизонта планирования
// (settings.endDate или +1 год). Пересоздаются только будущие сгенерированные
// вхождения (rec:…, с сегодняшнего дня): прошлые остаются как были, а
// отредактированные (rec-edit:…) и удалённые вручную вхождения — в
// recurring_exceptions, их перегенерация не трогает.
export async function regenerateRecurringOperations(today = todayIso()): Promise<void> {
  const db = await openDatabase();
  const rules = await listRecurringRules();
  const horizonSetting = await getSetting("endDate");

  const exceptionRows = await db.select<{ rule_id: string; date: string }[]>(
    "SELECT rule_id, date FROM recurring_exceptions"
  );
  const skippedByRule = new Map<string, Set<string>>();
  for (const row of exceptionRows) {
    const set = skippedByRule.get(row.rule_id) ?? new Set<string>();
    set.add(row.date);
    skippedByRule.set(row.rule_id, set);
  }
  const pastRows = await db.select<{ recurring_id: string }[]>(
    "SELECT DISTINCT recurring_id FROM operations WHERE recurring_id IS NOT NULL AND date < $1",
    [today]
  );
  const rulesWithPast = new Set(pastRows.map((row) => row.recurring_id));

  await db.execute("DELETE FROM operations WHERE id LIKE 'rec:%' AND date >= $1", [today]);

  for (const rule of rules) {
    // Если конец фин. года раньше старта правила, правило разложилось бы в ноль
    // операций — в этом случае раскладываем на год вперёд от старта правила.
    const horizon =
      horizonSetting && horizonSetting >= rule.startDate
        ? horizonSetting
        : oneYearAfter(rule.startDate);
    const dates = occurrencesToGenerate(
      recurringRuleOccurrences(rule, horizon),
      today,
      rulesWithPast.has(rule.id),
      skippedByRule.get(rule.id) ?? new Set()
    );
    for (const date of dates) {
      await db.execute(
        `INSERT OR IGNORE INTO operations
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
