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

export function balanceSeries(initialBalance: number, weeks: WeekPlan[]) {
  let balance = initialBalance;
  return weeks.map((week) => {
    balance += week.incomePlan - week.expensePlan;
    return {
      week: week.weekStart,
      balance,
      incomePlan: week.incomePlan,
      expensePlan: week.expensePlan,
      expenseActual: week.expenseActual
    };
  });
}

