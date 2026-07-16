import { computeWeeklyBalance } from "./finance";
import type { WeeklyBalanceResult } from "./finance";
import {
  getSetting,
  listAccounts,
  listOperations
} from "./repository";

// Загружает счета, операции и дату старта из БД и считает недельную цепочку
// баланса для дашборда (план — из planned-операций, включая регулярные).
// Пур-часть — в computeWeeklyBalance.
export async function loadWeeklyBalance(): Promise<WeeklyBalanceResult> {
  const [accounts, operations, startDate] = await Promise.all([
    listAccounts(),
    listOperations(),
    getSetting("startDate")
  ]);
  return computeWeeklyBalance(startDate, accounts, operations);
}
