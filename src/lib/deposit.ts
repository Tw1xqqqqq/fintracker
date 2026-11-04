import type { Deposit, Operation } from "../types";

// Проценты по вкладу: ежедневное начисление от остатка на конец дня.
// Ставка годовая, год берётся фактический (365 или 366 дней) — так считают
// банки, и в високосный год результат отличается. Начисленное либо остаётся
// отдельно («нет»), либо добавляется к вкладу в конце месяца («ежемесячно»)
// или в день закрытия («в конце срока») — дальше проценты начисляются уже на
// увеличенный остаток. Все суммы округляются до копеек.

export interface DepositInterest {
  accrued: number; // начислено за период
  capitalized: number; // из начисленного добавлено к телу вклада
  pending: number; // начислено, но ещё не добавлено
  balance: number; // остаток вклада на конец периода (с капитализацией)
  days: number; // сколько дней начисления попало в период
}

const EMPTY: DepositInterest = {
  accrued: 0,
  capitalized: 0,
  pending: 0,
  balance: 0,
  days: 0
};

function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeap(year) ? 366 : 365;
}

function isLastDayOfMonth(date: string): boolean {
  const d = parse(date);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return d.getUTCDate() === last;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// Как операция меняет тело вклада: пополнение (перевод на вклад) увеличивает,
// снятие — уменьшает. Проценты, занесённые как доход по счёту вклада, тоже
// увеличивают тело.
export function depositDelta(operation: Operation, accountId: string): number {
  if (operation.type === "transfer") {
    if (operation.accountId !== accountId) return 0;
    if (operation.targetAccountId === accountId) return operation.amount;
    if (operation.sourceAccountId === accountId) return -operation.amount;
    return 0;
  }
  if (operation.accountId !== accountId) return 0;
  return operation.type === "income" ? operation.amount : -operation.amount;
}

export interface InterestOptions {
  // Какие операции учитывать: только факт (по умолчанию) или факт и план —
  // для прогноза с учётом плановых пополнений и снятий.
  statuses?: Operation["status"][];
}

// startBalance — тело вклада на дату открытия (стартовый баланс счёта).
// Период [from, to] пересекается со сроком вклада: раньше открытия и позже
// закрытия проценты не начисляются.
export function depositInterest(
  deposit: Deposit,
  startBalance: number,
  operations: Operation[],
  from: string,
  to: string,
  options: InterestOptions = {}
): DepositInterest {
  const statuses = options.statuses ?? ["actual"];
  const start = from > deposit.openDate ? from : deposit.openDate;
  const closeDate = deposit.closeDate;
  const end = closeDate && closeDate < to ? closeDate : to;
  if (end < start) return { ...EMPTY, balance: round(startBalance) };

  const deltas = new Map<string, number>();
  for (const operation of operations) {
    if (!statuses.includes(operation.status)) continue;
    const delta = depositDelta(operation, deposit.accountId);
    if (delta === 0) continue;
    deltas.set(operation.date, (deltas.get(operation.date) ?? 0) + delta);
  }

  // Тело вклада на начало первого дня начисления: стартовая сумма плюс всё,
  // что пришло и ушло до этого дня.
  let balance = startBalance;
  deltas.forEach((delta, date) => {
    if (date < start) balance += delta;
  });

  const rate = deposit.rate / 100;
  let accrued = 0;
  let capitalized = 0;
  let pending = 0;
  let days = 0;

  for (let date = start; date <= end; date = addDays(date, 1)) {
    balance += deltas.get(date) ?? 0;
    if (balance > 0 && rate > 0) {
      const dayInterest = (balance * rate) / daysInYear(parse(date).getUTCFullYear());
      accrued += dayInterest;
      pending += dayInterest;
    }
    days += 1;

    const capitalize =
      deposit.capitalization === "monthly"
        ? isLastDayOfMonth(date) || date === closeDate
        : deposit.capitalization === "end"
          ? date === closeDate
          : false;
    if (capitalize && pending !== 0) {
      const added = round(pending);
      balance += added;
      capitalized += added;
      pending -= added;
    }
  }

  return {
    accrued: round(accrued),
    capitalized: round(capitalized),
    pending: round(pending),
    balance: round(balance),
    days
  };
}

export interface DepositForecast {
  balance: number; // тело вклада сейчас, с учётом капитализации
  accruedToDate: number; // начислено с открытия по сегодня
  accruedThisMonth: number; // начислено за текущий месяц
  accruedToClose: number | null; // ожидаемо к дате закрытия; null — вклад без срока
  closeBalance: number | null; // остаток на дату закрытия с процентами
  isClosed: boolean;
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

// Прогноз по вкладу: начислено на сегодня и за текущий месяц считается по
// факту, ожидаемое к закрытию — с учётом плановых пополнений и снятий.
export function depositForecast(
  deposit: Deposit,
  startBalance: number,
  operations: Operation[],
  today: string
): DepositForecast {
  const toDate = depositInterest(deposit, startBalance, operations, deposit.openDate, today);
  const thisMonth = depositInterest(
    deposit,
    startBalance,
    operations,
    monthStart(today) > deposit.openDate ? monthStart(today) : deposit.openDate,
    today
  );

  const closeDate = deposit.closeDate;
  const toClose = closeDate
    ? depositInterest(deposit, startBalance, operations, deposit.openDate, closeDate, {
        statuses: ["actual", "planned"]
      })
    : null;

  return {
    balance: toDate.balance,
    accruedToDate: toDate.accrued,
    accruedThisMonth: thisMonth.accrued,
    accruedToClose: toClose ? toClose.accrued : null,
    closeBalance: toClose ? round(toClose.balance + toClose.pending) : null,
    isClosed: Boolean(closeDate && closeDate < today)
  };
}
