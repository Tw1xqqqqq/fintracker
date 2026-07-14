import type { Account, Category, CategoryPlan, Operation, WeekPlan } from "../types";

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  }).format(value);
}

export function getCategory(categories: Category[], id: string): Category {
  return categories.find((category) => category.id === id) ?? categories[0];
}

export function getAccount(accounts: Account[], id: string): Account {
  return accounts.find((account) => account.id === id) ?? accounts[0];
}

export function plannedBalance(accounts: Account[], operations: Operation[]): number {
  const current = accounts.reduce((sum, account) => sum + account.balance, 0);
  return operations.reduce((sum, operation) => {
    if (operation.type === "income") return sum + operation.amount;
    if (operation.type === "expense") return sum - operation.amount;
    return sum;
  }, current);
}

export function totalByStatus(operations: Operation[], status: Operation["status"], type: Operation["type"]): number {
  return operations
    .filter((operation) => operation.status === status && operation.type === type)
    .reduce((sum, operation) => sum + operation.amount, 0);
}

export interface WeekBalance {
  weekStart: string;
  incomePlan: number;
  expensePlan: number;
  incomeActual: number;
  expenseActual: number;
  planNet: number; // план: доход − расход
  actualNet: number; // факт: доход − расход
  effectiveNet: number; // факт, если по неделе есть факт, иначе план
  openingBalance: number; // остаток, перенесённый с прошлой недели
  balance: number; // остаток на конец недели (прогнозный баланс)
  isCashGap: boolean; // balance < 0 — кассовый разрыв
}

// Сквозной пересчёт цепочки баланса по неделям.
// initialBalance — остаток на начало первой недели (напр. сумма счетов).
// Для каждой недели берём фактический нетто, если по ней есть факт,
// иначе плановый; остаток недели переносится в следующую (openingBalance
// = balance предыдущей). Недели с отрицательным балансом помечаются как
// кассовые разрывы.
export function balanceSeries(initialBalance: number, weeks: WeekPlan[]): WeekBalance[] {
  let running = initialBalance;
  return weeks.map((week) => {
    const planNet = week.incomePlan - week.expensePlan;
    const actualNet = week.incomeActual - week.expenseActual;
    const hasActual = week.incomeActual !== 0 || week.expenseActual !== 0;
    const effectiveNet = hasActual ? actualNet : planNet;

    const openingBalance = running;
    const balance = openingBalance + effectiveNet;
    running = balance;

    return {
      weekStart: week.weekStart,
      incomePlan: week.incomePlan,
      expensePlan: week.expensePlan,
      incomeActual: week.incomeActual,
      expenseActual: week.expenseActual,
      planNet,
      actualNet,
      effectiveNet,
      openingBalance,
      balance,
      isCashGap: balance < 0
    };
  });
}

export interface Week {
  index: number; // порядковый номер недели, с 0
  start: string; // дата начала недели, ISO yyyy-mm-dd
  end: string; // последний день недели (start + 6), ISO yyyy-mm-dd
}

const MAX_WEEKS = 520; // предохранитель (~10 лет), чтобы не зациклиться

// Разбор ISO-даты yyyy-mm-dd как UTC-полночь (без сдвига по таймзоне).
function parseIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

// Строит список недель от даты начала учёта с шагом 7 дней.
// Горизонт: конкретный endDate или, по умолчанию, конец года даты начала.
// Неделя включается, если её начало не позже конца горизонта.
export function generateWeeks(startDate: string, endDate?: string): Week[] {
  const start = parseIsoDate(startDate);
  if (!start) return [];

  const end = endDate
    ? parseIsoDate(endDate)
    : new Date(Date.UTC(start.getUTCFullYear(), 11, 31));
  if (!end || end.getTime() < start.getTime()) return [];

  const weeks: Week[] = [];
  let cursor = start;
  let index = 0;
  while (cursor.getTime() <= end.getTime() && index < MAX_WEEKS) {
    weeks.push({
      index,
      start: toIsoDate(cursor),
      end: toIsoDate(addDays(cursor, 6))
    });
    cursor = addDays(cursor, 7);
    index += 1;
  }
  return weeks;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Раскладывает операции по неделям и суммирует доход/расход отдельно
// для плана (status === "planned") и факта (status === "actual").
// Переводы (type === "transfer") не влияют на доход/расход и пропускаются.
// Операции вне диапазона недель игнорируются.
export function aggregateWeeks(operations: Operation[], weeks: Week[]): WeekPlan[] {
  const plans: WeekPlan[] = weeks.map((week) => ({
    weekStart: week.start,
    incomePlan: 0,
    expensePlan: 0,
    incomeActual: 0,
    expenseActual: 0
  }));
  if (weeks.length === 0) return plans;

  const firstStart = parseIsoDate(weeks[0].start);
  if (!firstStart) return plans;

  for (const operation of operations) {
    if (operation.type === "transfer") continue;
    const opDate = parseIsoDate(operation.date);
    if (!opDate) continue;

    const idx = Math.floor((opDate.getTime() - firstStart.getTime()) / WEEK_MS);
    if (idx < 0 || idx >= weeks.length) continue;
    // подстраховка на случай нестандартных недель: дата внутри idx-й недели
    if (operation.date < weeks[idx].start || operation.date > weeks[idx].end) continue;

    const target = plans[idx];
    if (operation.type === "income") {
      if (operation.status === "planned") target.incomePlan += operation.amount;
      else target.incomeActual += operation.amount;
    } else {
      if (operation.status === "planned") target.expensePlan += operation.amount;
      else target.expenseActual += operation.amount;
    }
  }

  return plans;
}

export interface WeeklyBalanceResult {
  startDate: string | null;
  initialBalance: number; // стартовый баланс = сумма балансов счетов
  accounts: Account[];
  operations: Operation[];
  weeks: WeekBalance[];
}

export function sumAccountBalances(accounts: Account[]): number {
  return accounts.reduce((total, account) => total + account.balance, 0);
}

const MIN_CHART_WEEKS = 4; // минимум недель для контекста, даже если данных нет

function hasActivity(plan: WeekPlan): boolean {
  return (
    plan.incomePlan !== 0 ||
    plan.expensePlan !== 0 ||
    plan.incomeActual !== 0 ||
    plan.expenseActual !== 0
  );
}

// Добавляет к недельному плану суммы из сетки статей (week_category_plans):
// доходные статьи -> incomePlan, расходные -> expensePlan.
function addCategoryPlans(
  plans: WeekPlan[],
  categories: Category[],
  categoryPlans: CategoryPlan[]
): void {
  if (categoryPlans.length === 0) return;
  const typeById = new Map(categories.map((category) => [category.id, category.type]));
  const byWeek = new Map(plans.map((plan) => [plan.weekStart, plan]));
  for (const categoryPlan of categoryPlans) {
    const type = typeById.get(categoryPlan.categoryId);
    const target = byWeek.get(categoryPlan.weekStart);
    if (!type || !target) continue;
    if (type === "income") target.incomePlan += categoryPlan.amount;
    else target.expensePlan += categoryPlan.amount;
  }
}

// Собирает недельную цепочку баланса из данных (без обращения к БД).
// Стартовый баланс = сумма балансов счетов; далее generateWeeks →
// aggregateWeeks → balanceSeries. План недели = плановые операции +
// суммы из сетки статей (categoryPlans); факт — из фактических операций.
// Длинный хвост пустых недель после последней активной обрезается
// (оставляем минимум для контекста). Без даты старта недели не строятся.
export function computeWeeklyBalance(
  startDate: string | null,
  accounts: Account[],
  operations: Operation[],
  categories: Category[] = [],
  categoryPlans: CategoryPlan[] = []
): WeeklyBalanceResult {
  const initialBalance = sumAccountBalances(accounts);
  if (!startDate) {
    return { startDate, initialBalance, accounts, operations, weeks: [] };
  }

  const plans = aggregateWeeks(operations, generateWeeks(startDate));
  addCategoryPlans(plans, categories, categoryPlans);

  let lastActive = -1;
  plans.forEach((plan, index) => {
    if (hasActivity(plan)) lastActive = index;
  });
  const count = Math.min(plans.length, Math.max(lastActive + 1, MIN_CHART_WEEKS));

  const weeks = balanceSeries(initialBalance, plans.slice(0, count));
  return { startDate, initialBalance, accounts, operations, weeks };
}

const WEEKS_PER_YEAR = 52;

// Средняя недельная сумма по каждой статье на основе факта прошлого
// (относительно года плана) календарного года: сумма факта за прошлый
// год / 52. Учитываются только фактические операции, переводы — нет.
export function suggestWeeklyAverages(
  operations: Operation[],
  planYear: number
): Map<string, number> {
  const prevYear = planYear - 1;
  const from = `${prevYear}-01-01`;
  const to = `${prevYear}-12-31`;

  const totals = new Map<string, number>();
  for (const operation of operations) {
    if (operation.status !== "actual" || operation.type === "transfer") continue;
    if (operation.date < from || operation.date > to) continue;
    totals.set(operation.categoryId, (totals.get(operation.categoryId) ?? 0) + operation.amount);
  }

  const averages = new Map<string, number>();
  totals.forEach((total, categoryId) => {
    averages.set(categoryId, Math.round(total / WEEKS_PER_YEAR));
  });
  return averages;
}

const MAX_OCCURRENCES = 1000; // предохранитель от зацикливания

// Даты повторений правила: от startDate с шагом intervalDays, пока не позже
// горизонта (horizonEnd) и не позже endDate правила (если задан).
export function recurringOccurrences(
  startDate: string,
  intervalDays: number,
  endDate: string | null,
  horizonEnd: string
): string[] {
  const start = parseIsoDate(startDate);
  const horizon = parseIsoDate(horizonEnd);
  if (!start || !horizon || intervalDays < 1) return [];

  const ruleEnd = endDate ? parseIsoDate(endDate) : null;
  const limit = ruleEnd && ruleEnd.getTime() < horizon.getTime() ? ruleEnd : horizon;
  if (limit.getTime() < start.getTime()) return [];

  const dates: string[] = [];
  let cursor = start;
  let index = 0;
  while (cursor.getTime() <= limit.getTime() && index < MAX_OCCURRENCES) {
    dates.push(toIsoDate(cursor));
    cursor = addDays(cursor, intervalDays);
    index += 1;
  }
  return dates;
}

