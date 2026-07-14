import type {
  Account,
  Category,
  CategoryPlan,
  Operation,
  RecurringRule,
  WeekPlan
} from "../types";
import { categories as seedCategories } from "../data/seed";
import { recurringOccurrences } from "./finance";
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

type WeekPlanRow = {
  week_start: string;
  income_plan: number;
  expense_plan: number;
  income_actual: number;
  expense_actual: number;
};

function mapWeekPlan(row: WeekPlanRow): WeekPlan {
  return {
    weekStart: row.week_start,
    incomePlan: row.income_plan,
    expensePlan: row.expense_plan,
    incomeActual: row.income_actual,
    expenseActual: row.expense_actual
  };
}

// Недельный план хранится в таблице week_plans (план — ввод пользователя).
// Факт при этом остаётся производным от операций, а не пишется сюда.
export async function listWeekPlans(): Promise<WeekPlan[]> {
  const db = await openDatabase();
  const rows = await db.select<WeekPlanRow[]>(
    `SELECT week_start, income_plan, expense_plan, income_actual, expense_actual
       FROM week_plans
      ORDER BY week_start`
  );
  return rows.map(mapWeekPlan);
}

export async function upsertWeekPlan(plan: WeekPlan): Promise<void> {
  const db = await openDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO week_plans
       (week_start, income_plan, expense_plan, income_actual, expense_actual)
     VALUES ($1, $2, $3, $4, $5)`,
    [plan.weekStart, plan.incomePlan, plan.expensePlan, plan.incomeActual, plan.expenseActual]
  );
}

// План по статьям на неделю (для сетки планирования статья × неделя).
export async function listCategoryPlans(): Promise<CategoryPlan[]> {
  const db = await openDatabase();
  const rows = await db.select<{ week_start: string; category_id: string; amount: number }[]>(
    "SELECT week_start, category_id, amount FROM week_category_plans"
  );
  return rows.map((row) => ({
    weekStart: row.week_start,
    categoryId: row.category_id,
    amount: row.amount
  }));
}

// Пустую (0) сумму не храним — удаляем строку, чтобы таблица оставалась разреженной.
export async function upsertCategoryPlan(
  weekStart: string,
  categoryId: string,
  amount: number
): Promise<void> {
  const db = await openDatabase();
  if (!amount) {
    await db.execute(
      "DELETE FROM week_category_plans WHERE week_start = $1 AND category_id = $2",
      [weekStart, categoryId]
    );
    return;
  }
  await db.execute(
    "INSERT OR REPLACE INTO week_category_plans (week_start, category_id, amount) VALUES ($1, $2, $3)",
    [weekStart, categoryId, amount]
  );
}

type RecurringRuleRow = {
  id: string;
  type: RecurringRule["type"];
  category_id: string;
  account_id: string;
  amount: number;
  interval_days: number;
  start_date: string;
  end_date: string | null;
  description: string;
};

function mapRecurringRule(row: RecurringRuleRow): RecurringRule {
  return {
    id: row.id,
    type: row.type,
    categoryId: row.category_id,
    accountId: row.account_id,
    amount: row.amount,
    intervalDays: row.interval_days,
    startDate: row.start_date,
    endDate: row.end_date,
    description: row.description
  };
}

export async function listRecurringRules(): Promise<RecurringRule[]> {
  const db = await openDatabase();
  const rows = await db.select<RecurringRuleRow[]>(
    `SELECT id, type, category_id, account_id, amount, interval_days,
            start_date, end_date, description
       FROM recurring_rules
      ORDER BY start_date`
  );
  return rows.map(mapRecurringRule);
}

export async function upsertRecurringRule(rule: RecurringRule): Promise<void> {
  const db = await openDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO recurring_rules
       (id, type, category_id, account_id, amount, interval_days, start_date, end_date, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      rule.id,
      rule.type,
      rule.categoryId,
      rule.accountId,
      rule.amount,
      rule.intervalDays,
      rule.startDate,
      rule.endDate,
      rule.description
    ]
  );
}

export async function deleteRecurringRule(id: string): Promise<void> {
  const db = await openDatabase();
  await db.execute("DELETE FROM recurring_rules WHERE id = $1", [id]);
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
    const horizon = horizonSetting || oneYearAfter(rule.startDate);
    const dates = recurringOccurrences(rule.startDate, rule.intervalDays, rule.endDate, horizon);
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
