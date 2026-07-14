import { computeWeeklyBalance } from "./finance";
import type { WeeklyBalanceResult } from "./finance";
import {
  getSetting,
  listAccounts,
  listCategories,
  listCategoryPlans,
  listOperations
} from "./repository";

// Загружает счета, операции, категории и план сетки из БД и считает
// недельную цепочку баланса для дашборда. Пур-часть — в computeWeeklyBalance.
export async function loadWeeklyBalance(): Promise<WeeklyBalanceResult> {
  const [accounts, operations, startDate, categories, categoryPlans] = await Promise.all([
    listAccounts(),
    listOperations(),
    getSetting("startDate"),
    listCategories(),
    listCategoryPlans()
  ]);
  return computeWeeklyBalance(startDate, accounts, operations, categories, categoryPlans);
}
