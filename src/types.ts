export type OperationType = "income" | "expense" | "transfer";

export type OperationStatus = "planned" | "actual";

export interface Account {
  id: string;
  name: string;
  type: "cash" | "card" | "savings" | "credit";
  balance: number;
}

export interface Category {
  id: string;
  name: string;
  type: Exclude<OperationType, "transfer">;
  color: string;
}

export interface Operation {
  id: string;
  date: string;
  type: OperationType;
  status: OperationStatus;
  categoryId: string;
  accountId: string;
  amount: number;
  description: string;
}

export interface WeekPlan {
  weekStart: string;
  incomePlan: number;
  expensePlan: number;
  incomeActual: number;
  expenseActual: number;
}

