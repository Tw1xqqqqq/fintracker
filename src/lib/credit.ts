import type { CreditCard, Operation } from "../types";

// Кредитка с льготным периодом по расчётному периоду (решение заказчика 22.10):
// покупки с дня после прошлой выписки по день выписки включительно попадают в
// эту выписку; долг на дату выписки нужно погасить до даты платежа
// (= дата выписки + платёжный период) — это последний день без процентов.
// Покупки после выписки уходят в следующую.

export interface CreditStatement {
  periodStart: string; // первый день расчётного периода
  statementDate: string; // день выписки (конец периода)
  dueDate: string; // дата платежа — последний день без процентов
  payBy: string; // когда планировать погашение: dueDate − буфер
  statementDebt: number; // долг на дату выписки
  paid: number; // внесено после выписки по дату платежа включительно
  remaining: number; // осталось погасить, чтобы сохранить льготу
  overdue: boolean; // дата платежа прошла, а выписка погашена не полностью
}

export type CreditStatus = "clear" | "period" | "due" | "soon" | "overdue";

export interface CreditCardState {
  debt: number; // текущий долг
  available: number; // доступный лимит
  statements: CreditStatement[]; // закрытые выписки (statementDate ≤ asOf)
  nextDue: CreditStatement | null; // ближайшая непогашенная выписка
  currentPeriod: { start: string; statementDate: string; spent: number };
  status: CreditStatus;
  daysLeft: number | null; // дней до даты платежа nextDue (отрицательно — просрочка)
}

export const SOON_DAYS = 5;

function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysIso(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

// День выписки в конкретном месяце; 31 в коротком месяце — последний день.
function statementInMonth(year: number, month: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(year, month, Math.min(day, lastDay))));
}

// Ближайшая дата выписки не раньше date (выписка в этот же день — включительно).
export function statementDateOnOrAfter(date: string, statementDay: number): string {
  const d = parse(date);
  const sameMonth = statementInMonth(d.getUTCFullYear(), d.getUTCMonth(), statementDay);
  if (sameMonth >= date) return sameMonth;
  return statementInMonth(d.getUTCFullYear(), d.getUTCMonth() + 1, statementDay);
}

function nextStatementDate(statementDate: string, statementDay: number): string {
  return statementDateOnOrAfter(addDaysIso(statementDate, 1), statementDay);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// Влияние операции на долг по карте: покупка и списание с карты увеличивают
// долг, возврат и погашение (перевод на карту) — уменьшают.
export function debtDelta(operation: Operation, accountId: string): number {
  if (operation.type === "transfer") {
    if (operation.accountId !== accountId) return 0;
    if (operation.targetAccountId === accountId) return -operation.amount;
    if (operation.sourceAccountId === accountId) return operation.amount;
    return 0;
  }
  if (operation.accountId !== accountId) return 0;
  return operation.type === "expense" ? operation.amount : -operation.amount;
}

// Состояние карты на дату asOf по фактическим операциям.
// startDebt — долг на начало учёта (since); в первую выписку он входит целиком.
export function creditCardState(
  card: CreditCard,
  startDebt: number,
  operations: Operation[],
  since: string,
  asOf: string
): CreditCardState {
  const events = operations
    .filter((op) => op.status === "actual" && op.date <= asOf && op.date >= since)
    .map((op) => ({ date: op.date, delta: debtDelta(op, card.accountId) }))
    .filter((event) => event.delta !== 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const debtAt = (date: string) =>
    events.reduce((sum, event) => (event.date <= date ? sum + event.delta : sum), startDebt);
  const repaidBetween = (afterDate: string, untilDate: string) =>
    events.reduce(
      (sum, event) =>
        event.date > afterDate && event.date <= untilDate && event.delta < 0
          ? sum - event.delta
          : sum,
      0
    );

  const statements: CreditStatement[] = [];
  let periodStart = since;
  let statementDate = statementDateOnOrAfter(since, card.statementDay);
  while (statementDate <= asOf) {
    const statementDebt = round(Math.max(0, debtAt(statementDate)));
    const dueDate = addDaysIso(statementDate, card.paymentDays);
    const paid = round(Math.min(statementDebt, repaidBetween(statementDate, dueDate)));
    const remaining = round(statementDebt - paid);
    statements.push({
      periodStart,
      statementDate,
      dueDate,
      payBy: addDaysIso(dueDate, -card.repayBufferDays),
      statementDebt,
      paid,
      remaining,
      overdue: remaining > 0 && asOf > dueDate
    });
    periodStart = addDaysIso(statementDate, 1);
    statementDate = nextStatementDate(statementDate, card.statementDay);
  }

  const debt = round(Math.max(0, debtAt(asOf)));
  const spent = round(
    events.reduce(
      (sum, event) => (event.date >= periodStart && event.delta > 0 ? sum + event.delta : sum),
      0
    )
  );
  // Ждёт погашения только последняя выписка: долг прошлых выписок либо погашен,
  // либо уже вошёл в неё (долг на дату выписки накопительный).
  const last = statements[statements.length - 1];
  const nextDue = last && last.remaining > 0 && debt > 0 ? last : null;

  // Просрочка тянется, пока после неё не было полностью погашенной выписки:
  // долг просроченной выписки входит и в следующую.
  const lastClearedIdx = statements.reduce((idx, s, i) => (s.remaining === 0 ? i : idx), -1);
  const overdueUncleared = statements.slice(lastClearedIdx + 1).some((s) => s.overdue);

  let status: CreditStatus;
  let daysLeft: number | null = null;
  if (nextDue) {
    daysLeft = daysBetween(asOf, nextDue.dueDate);
    status =
      nextDue.overdue || overdueUncleared ? "overdue" : daysLeft <= SOON_DAYS ? "soon" : "due";
  } else {
    status = debt > 0 ? "period" : "clear";
  }

  return {
    debt,
    available: round(Math.max(0, card.creditLimit - debt)),
    statements,
    nextDue,
    currentPeriod: { start: periodStart, statementDate, spent },
    status,
    daysLeft
  };
}
