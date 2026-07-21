import type { Account, Category, Operation, RecurringRule, WeekPlan } from "../types";

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

// Собирает недельную цепочку баланса из данных (без обращения к БД).
// Стартовый баланс = сумма балансов счетов; далее generateWeeks →
// aggregateWeeks → balanceSeries. План и факт берутся только из operations.
// endDate задаёт конец горизонта (конец финансового года); без него недели
// строятся до конца года даты старта. Длинный хвост пустых недель после
// последней активной обрезается (оставляем минимум для контекста).
// Без даты старта недели не строятся.
export function computeWeeklyBalance(
  startDate: string | null,
  accounts: Account[],
  operations: Operation[],
  endDate?: string | null
): WeeklyBalanceResult {
  const initialBalance = sumAccountBalances(accounts);
  if (!startDate) {
    return { startDate, initialBalance, accounts, operations, weeks: [] };
  }

  const plans = aggregateWeeks(operations, generateWeeks(startDate, endDate ?? undefined));

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
    if (!operation.categoryId) continue;
    if (operation.date < from || operation.date > to) continue;
    totals.set(operation.categoryId, (totals.get(operation.categoryId) ?? 0) + operation.amount);
  }

  const averages = new Map<string, number>();
  totals.forEach((total, categoryId) => {
    averages.set(categoryId, Math.round(total / WEEKS_PER_YEAR));
  });
  return averages;
}

// Ячейка бюджета показывает общий план: ручная часть + зафиксированные
// planned-операции (например, регулярные). При редактировании меняем только
// ручную часть; значение ниже зафиксированной суммы недопустимо.
export function manualPlanAmountForTarget(
  targetAmount: number,
  totalAmount: number,
  currentManualAmount: number
): number | null {
  const fixedAmount = Math.max(0, totalAmount - currentManualAmount);
  if (targetAmount < fixedAmount) return null;
  return targetAmount - fixedAmount;
}

// Расчётный остаток на дату: стартовые балансы счетов + нетто фактических
// операций по эту дату включительно (план и переводы не влияют на общий итог).
export function computeExpectedBalance(
  accounts: Account[],
  operations: Operation[],
  asOfDate: string
): number {
  return operations.reduce((sum, operation) => {
    if (operation.status !== "actual" || operation.date > asOfDate) return sum;
    if (operation.type === "income") return sum + operation.amount;
    if (operation.type === "expense") return sum - operation.amount;
    return sum;
  }, sumAccountBalances(accounts));
}

export interface AccountBalance {
  account: Account;
  balance: number; // текущий остаток = стартовый баланс + факт-операции по счёту
}

// Текущий остаток каждого счёта: стартовый баланс + нетто фактических операций
// по этому счёту. Перевод учитывается по ноге: на счёте-источнике списание,
// на счёте-получателе зачисление (общий итог по всем счетам не меняется).
// asOfDate — опционально; учитываются операции по эту дату включительно.
export function computeAccountBalances(
  accounts: Account[],
  operations: Operation[],
  asOfDate?: string
): AccountBalance[] {
  const byId = new Map<string, number>();
  for (const account of accounts) byId.set(account.id, account.balance);

  const apply = (accountId: string, delta: number) => {
    if (!byId.has(accountId)) return; // операция по неизвестному/удалённому счёту
    byId.set(accountId, (byId.get(accountId) ?? 0) + delta);
  };

  for (const operation of operations) {
    if (operation.status !== "actual") continue;
    if (asOfDate && operation.date > asOfDate) continue;

    if (operation.type === "transfer") {
      if (operation.accountId === operation.targetAccountId) apply(operation.accountId, operation.amount);
      else if (operation.accountId === operation.sourceAccountId) apply(operation.accountId, -operation.amount);
      continue;
    }
    apply(operation.accountId, operation.type === "income" ? operation.amount : -operation.amount);
  }

  return accounts.map((account) => ({
    account,
    balance: byId.get(account.id) ?? account.balance
  }));
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

function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day; // 1 (пн) … 7 (вс)
}

function mondayOf(date: Date): Date {
  return addDays(date, 1 - isoWeekday(date));
}

// Повтор «в то же число месяца» с поджатием к концу короткого месяца (31 -> 28/30).
function monthlyByDate(start: Date, monthOffset: number): Date {
  const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + monthOffset, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
  ).getUTCDate();
  return new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(start.getUTCDate(), lastDay))
  );
}

function monthlyOccurrence(start: Date, monthOffset: number): Date {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + monthOffset;
  const targetMonthStart = new Date(Date.UTC(year, month, 1));
  const targetYear = targetMonthStart.getUTCFullYear();
  const targetMonth = targetMonthStart.getUTCMonth();
  const weekday = start.getUTCDay();
  const ordinal = Math.ceil(start.getUTCDate() / 7);
  const firstWeekday = targetMonthStart.getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  let day = 1 + offset + (ordinal - 1) * 7;
  const daysInMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  if (day > daysInMonth) day -= 7;
  return new Date(Date.UTC(targetYear, targetMonth, day));
}

function yearlyOccurrence(start: Date, yearOffset: number): Date {
  const year = start.getUTCFullYear() + yearOffset;
  const month = start.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay)));
}

// Генерирует даты с учётом календарного типа регулярности и ограничений правила.
// Для monthly сохраняется порядковый день недели (например, первый вторник месяца),
// для yearly — месяц и число, для weekdays пропускаются суббота и воскресенье.
// Для kind = interval единица шага задаётся intervalUnit (день/неделя/месяц/год):
// неделя — выбранные дни недели (weekdays) внутри каждого N-го недельного блока,
// месяц — то же число (monthlyMode = date) или порядковый день недели (weekday).
export function recurringRuleOccurrences(rule: RecurringRule, horizonEnd: string): string[] {
  const start = parseIsoDate(rule.startDate);
  const horizon = parseIsoDate(horizonEnd);
  if (!start || !horizon || rule.intervalDays < 1) return [];

  const ruleEnd = rule.endDate ? parseIsoDate(rule.endDate) : null;
  const limit = ruleEnd && ruleEnd.getTime() < horizon.getTime() ? ruleEnd : horizon;
  if (limit.getTime() < start.getTime()) return [];

  const maxCount = Math.min(rule.occurrenceCount ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  if (maxCount < 1) return [];

  const unit = rule.recurrenceKind === "interval" ? rule.intervalUnit ?? "day" : "day";

  // Недельный интервал с выбранными днями: идём блоками по N недель от недели старта
  // и внутри блока отдаём отмеченные дни (не раньше даты старта).
  if (rule.recurrenceKind === "interval" && unit === "week") {
    const selected =
      rule.weekdays && rule.weekdays.length > 0
        ? [...rule.weekdays].sort((a, b) => a - b)
        : [isoWeekday(start)];
    const dates: string[] = [];
    let block = mondayOf(start);
    let guard = 0;
    outer: while (block.getTime() <= limit.getTime() && guard < MAX_OCCURRENCES) {
      for (const weekday of selected) {
        const date = addDays(block, weekday - 1);
        if (date.getTime() < start.getTime()) continue;
        if (date.getTime() > limit.getTime()) break outer;
        dates.push(toIsoDate(date));
        if (dates.length >= maxCount) break outer;
      }
      block = addDays(block, rule.intervalDays * 7);
      guard += 1;
    }
    return dates;
  }

  const dates: string[] = [];
  let cursor = start;
  let sequenceIndex = 0;

  while (
    cursor.getTime() <= limit.getTime() &&
    dates.length < maxCount &&
    sequenceIndex < MAX_OCCURRENCES * 2
  ) {
    const isWeekday = cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6;
    if (rule.recurrenceKind !== "weekdays" || isWeekday) {
      dates.push(toIsoDate(cursor));
    }

    sequenceIndex += 1;
    if (rule.recurrenceKind === "monthly") {
      cursor = monthlyOccurrence(start, sequenceIndex);
    } else if (rule.recurrenceKind === "yearly") {
      cursor = yearlyOccurrence(start, sequenceIndex);
    } else if (rule.recurrenceKind === "weekdays") {
      cursor = addDays(cursor, 1);
    } else if (rule.recurrenceKind === "interval" && unit === "month") {
      cursor =
        rule.monthlyMode === "weekday"
          ? monthlyOccurrence(start, sequenceIndex * rule.intervalDays)
          : monthlyByDate(start, sequenceIndex * rule.intervalDays);
    } else if (rule.recurrenceKind === "interval" && unit === "year") {
      cursor = yearlyOccurrence(start, sequenceIndex * rule.intervalDays);
    } else {
      cursor = addDays(cursor, rule.intervalDays);
    }
  }

  return dates;
}

