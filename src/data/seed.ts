import type { Account, Category, Operation, WeekPlan } from "../types";

export const accounts: Account[] = [
  { id: "cash", name: "Наличные", type: "cash", balance: 18400 },
  { id: "main-card", name: "Основная карта", type: "card", balance: 76200 },
  { id: "savings", name: "Накопления", type: "savings", balance: 140000 }
];

export const categories: Category[] = [
  { id: "salary", name: "Зарплата", type: "income", color: "#2f9e44" },
  { id: "freelance", name: "Подработка", type: "income", color: "#0b7285" },
  { id: "food", name: "Продукты", type: "expense", color: "#e67700" },
  { id: "transport", name: "Транспорт", type: "expense", color: "#5f3dc4" },
  { id: "home", name: "Дом", type: "expense", color: "#c92a2a" },
  { id: "fun", name: "Развлечения", type: "expense", color: "#d6336c" }
];

export const operations: Operation[] = [
  {
    id: "op-1",
    date: "2026-07-01",
    type: "income",
    status: "actual",
    categoryId: "salary",
    accountId: "main-card",
    amount: 92000,
    description: "Аванс"
  },
  {
    id: "op-2",
    date: "2026-07-02",
    type: "expense",
    status: "actual",
    categoryId: "food",
    accountId: "main-card",
    amount: 3850,
    description: "Покупка продуктов"
  },
  {
    id: "op-3",
    date: "2026-07-05",
    type: "expense",
    status: "planned",
    categoryId: "home",
    accountId: "main-card",
    amount: 17500,
    description: "Коммунальные платежи"
  },
  {
    id: "op-4",
    date: "2026-07-08",
    type: "expense",
    status: "planned",
    categoryId: "transport",
    accountId: "main-card",
    amount: 2800,
    description: "Проездной"
  },
  {
    id: "op-5",
    date: "2026-07-12",
    type: "income",
    status: "planned",
    categoryId: "freelance",
    accountId: "main-card",
    amount: 24000,
    description: "Проектная работа"
  }
];

export const weeklyPlan: WeekPlan[] = [
  { weekStart: "01.07", incomePlan: 92000, expensePlan: 22000, incomeActual: 92000, expenseActual: 3850 },
  { weekStart: "08.07", incomePlan: 24000, expensePlan: 31000, incomeActual: 0, expenseActual: 0 },
  { weekStart: "15.07", incomePlan: 0, expensePlan: 18500, incomeActual: 0, expenseActual: 0 },
  { weekStart: "22.07", incomePlan: 92000, expensePlan: 27500, incomeActual: 0, expenseActual: 0 }
];

