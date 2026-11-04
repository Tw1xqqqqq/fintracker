import type { Account, Operation } from "../types";
import { computeAccountBalances } from "./finance";

// Группы счетов (решение по двойной записи): деньги, которыми можно
// распорядиться сейчас, деньги на вкладах и долг по кредиткам живут отдельно.
// «Итоговый баланс» в таблице бюджета считается по свободным деньгам, иначе
// покупка по кредитке выглядела бы как траты своих денег, а перевод на вклад —
// как их потеря.
export type AccountGroup = "liquid" | "deposit" | "credit";

const GROUP_BY_TYPE: Record<Account["type"], AccountGroup> = {
  cash: "liquid",
  card: "liquid",
  savings: "deposit",
  credit: "credit"
};

export function accountGroup(account: Account): AccountGroup {
  return GROUP_BY_TYPE[account.type] ?? "liquid";
}

export function accountsInGroup(accounts: Account[], group: AccountGroup): Account[] {
  return accounts.filter((account) => accountGroup(account) === group);
}

export function groupAccounts(accounts: Account[]): Record<AccountGroup, Account[]> {
  return {
    liquid: accountsInGroup(accounts, "liquid"),
    deposit: accountsInGroup(accounts, "deposit"),
    credit: accountsInGroup(accounts, "credit")
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface GroupBalances {
  liquid: number; // свободные деньги: наличные и дебетовые карты
  deposit: number; // деньги на вкладах
  debt: number; // долг по кредиткам, положительное число
  netWorth: number; // чистый капитал = свободные + вклады − долг
}

// Остатки по группам на дату (включительно). Долг по кредитке считается по
// каждой карте отдельно и не уходит в минус: переплата по одной карте не
// уменьшает долг по другой.
export function groupBalancesAt(
  accounts: Account[],
  operations: Operation[],
  asOfDate?: string
): GroupBalances {
  const balances = computeAccountBalances(accounts, operations, asOfDate);
  let liquid = 0;
  let deposit = 0;
  let debt = 0;

  for (const { account, balance } of balances) {
    const group = accountGroup(account);
    if (group === "liquid") liquid += balance;
    else if (group === "deposit") deposit += balance;
    else debt += Math.max(0, -balance);
  }

  return {
    liquid: round(liquid),
    deposit: round(deposit),
    debt: round(debt),
    netWorth: round(liquid + deposit - debt)
  };
}

export function liquidBalanceAt(
  accounts: Account[],
  operations: Operation[],
  asOfDate?: string
): number {
  return groupBalancesAt(accounts, operations, asOfDate).liquid;
}

export function creditDebtAt(
  accounts: Account[],
  operations: Operation[],
  asOfDate?: string
): number {
  return groupBalancesAt(accounts, operations, asOfDate).debt;
}

export function depositBalanceAt(
  accounts: Account[],
  operations: Operation[],
  asOfDate?: string
): number {
  return groupBalancesAt(accounts, operations, asOfDate).deposit;
}

// Сумма стартовых балансов группы — нужна как начало цепочки баланса в таблице
// бюджета (до первой недели учёта операций ещё нет).
export function initialGroupBalance(accounts: Account[], group: AccountGroup): number {
  return round(
    accountsInGroup(accounts, group).reduce((sum, account) => sum + account.balance, 0)
  );
}

export interface LiquidWeekFlow {
  weekStart: string;
  incomePlan: number;
  expensePlan: number;
  transferOutPlan: number; // нетто-отток со свободных денег по переводам
  incomeActual: number;
  expenseActual: number;
  transferOutActual: number;
  hasActual: boolean;
}

// Движение свободных денег по неделям. В доход и расход попадают только
// операции по свободным счетам: покупка по кредитке свободных денег не
// уменьшает, она увеличивает долг. Переводы учитываются по ноге: со
// свободного счёта — отток, на свободный счёт — приток, поэтому перевод между
// своими счетами даёт ноль.
export function liquidWeekFlows(
  accounts: Account[],
  operations: Operation[],
  weeks: { start: string; end: string }[]
): LiquidWeekFlow[] {
  const groupById = new Map(accounts.map((account) => [account.id, accountGroup(account)]));
  const isLiquid = (accountId: string | null | undefined) =>
    Boolean(accountId) && groupById.get(accountId as string) === "liquid";

  const flows: LiquidWeekFlow[] = weeks.map((week) => ({
    weekStart: week.start,
    incomePlan: 0,
    expensePlan: 0,
    transferOutPlan: 0,
    incomeActual: 0,
    expenseActual: 0,
    transferOutActual: 0,
    hasActual: false
  }));

  for (const operation of operations) {
    const index = weeks.findIndex(
      (week) => operation.date >= week.start && operation.date <= week.end
    );
    if (index < 0) continue;
    const flow = flows[index];
    const actual = operation.status === "actual";

    if (operation.type === "transfer") {
      let delta = 0;
      if (operation.accountId === operation.sourceAccountId && isLiquid(operation.sourceAccountId)) {
        delta = operation.amount;
      } else if (
        operation.accountId === operation.targetAccountId &&
        isLiquid(operation.targetAccountId)
      ) {
        delta = -operation.amount;
      }
      if (delta === 0) continue;
      if (actual) {
        flow.transferOutActual += delta;
        flow.hasActual = true;
      } else {
        flow.transferOutPlan += delta;
      }
      continue;
    }

    if (!isLiquid(operation.accountId)) continue;
    if (operation.type === "income") {
      if (actual) {
        flow.incomeActual += operation.amount;
        flow.hasActual = true;
      } else flow.incomePlan += operation.amount;
    } else {
      if (actual) {
        flow.expenseActual += operation.amount;
        flow.hasActual = true;
      } else flow.expensePlan += operation.amount;
    }
  }

  return flows.map((flow) => ({
    ...flow,
    incomePlan: round(flow.incomePlan),
    expensePlan: round(flow.expensePlan),
    transferOutPlan: round(flow.transferOutPlan),
    incomeActual: round(flow.incomeActual),
    expenseActual: round(flow.expenseActual),
    transferOutActual: round(flow.transferOutActual)
  }));
}

export interface LiquidBalances {
  plan: number[]; // остаток свободных денег только по плану
  effective: number[]; // факт, где он есть, иначе план — от остатка прошлой недели
}

// Цепочка остатка свободных денег по неделям. Неделя без факта считается от
// остатка предыдущей недели (с учётом её факта), как и «Итоговый баланс»:
// иначе прогноз «забывал» бы реальные доходы и расходы.
export function liquidBalanceSeries(
  initialLiquid: number,
  flows: LiquidWeekFlow[]
): LiquidBalances {
  let plan = initialLiquid;
  let effective = initialLiquid;
  const planSeries: number[] = [];
  const effectiveSeries: number[] = [];

  for (const flow of flows) {
    const planNet = flow.incomePlan - flow.expensePlan - flow.transferOutPlan;
    const actualNet = flow.incomeActual - flow.expenseActual - flow.transferOutActual;
    plan = round(plan + planNet);
    effective = round(effective + (flow.hasActual ? actualNet : planNet));
    planSeries.push(plan);
    effectiveSeries.push(effective);
  }

  return { plan: planSeries, effective: effectiveSeries };
}

export interface TransferFlows {
  toDeposit: number; // переводы со свободных денег на вклады
  fromDeposit: number; // переводы с вкладов на свободные деньги
  repayByCard: Map<string, number>; // погашение кредиток: id карты -> сумма
}

// Нетто-потоки группы «Переводы» за период: сколько ушло на вклады, сколько
// вернулось и сколько внесено на каждую кредитку. Считается по исходящей ноге
// перевода, чтобы каждый перевод попал в сумму один раз.
export function transferFlows(
  accounts: Account[],
  operations: Operation[],
  status: Operation["status"],
  from: string,
  to: string
): TransferFlows {
  const groupById = new Map(accounts.map((account) => [account.id, accountGroup(account)]));
  const flows: TransferFlows = { toDeposit: 0, fromDeposit: 0, repayByCard: new Map() };

  for (const operation of operations) {
    if (operation.type !== "transfer" || operation.status !== status) continue;
    if (operation.date < from || operation.date > to) continue;
    // Одна нога на перевод: берём исходящую.
    if (operation.accountId !== operation.sourceAccountId) continue;

    const source = groupById.get(operation.sourceAccountId ?? "");
    const target = operation.targetAccountId ?? "";
    const targetGroup = groupById.get(target);

    if (source === "liquid" && targetGroup === "deposit") {
      flows.toDeposit += operation.amount;
    } else if (source === "deposit" && targetGroup === "liquid") {
      flows.fromDeposit += operation.amount;
    } else if (source === "liquid" && targetGroup === "credit") {
      flows.repayByCard.set(target, (flows.repayByCard.get(target) ?? 0) + operation.amount);
    }
  }

  flows.toDeposit = round(flows.toDeposit);
  flows.fromDeposit = round(flows.fromDeposit);
  flows.repayByCard.forEach((value, key) => flows.repayByCard.set(key, round(value)));
  return flows;
}
