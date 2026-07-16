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
  categoryId: string | null;
  accountId: string;
  amount: number;
  description: string;
  recurringId?: string | null;
  sourceAccountId?: string | null;
  targetAccountId?: string | null;
  transferId?: string | null;
}

export interface WeekPlan {
  weekStart: string;
  incomePlan: number;
  expensePlan: number;
  incomeActual: number;
  expenseActual: number;
}

export interface Reconciliation {
  id: string;
  date: string;
  expected: number;
  actual: number;
  diff: number;
  operationId: string | null; // корректирующая операция, если создавалась
  createdAt: string;
}

export type RecurrenceKind =
  | "interval"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "weekdays";

export type IntervalUnit = "day" | "week" | "month" | "year";

export interface RecurringRule {
  id: string;
  type: Exclude<OperationType, "transfer">;
  categoryId: string;
  accountId: string;
  amount: number;
  recurrenceKind: RecurrenceKind;
  intervalDays: number; // счётчик интервала (в единицах intervalUnit; для kind != interval — дни)
  intervalUnit?: IntervalUnit; // для kind = interval; по умолчанию "day"
  weekdays?: number[] | null; // для unit = week: 1 (пн) … 7 (вс)
  monthlyMode?: "date" | "weekday" | null; // unit = month: то же число / порядковый день недели
  startDate: string;
  endDate: string | null; // null = без конца
  occurrenceCount: number | null; // null = ограничение по количеству не задано
  description: string;
}

