import type { Account, Category, Operation, WeekPlan } from "../types";

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

