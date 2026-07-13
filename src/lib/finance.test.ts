import { describe, expect, it } from "vitest";
import type { Account, Operation, WeekPlan } from "../types";
import { aggregateWeeks, balanceSeries, computeWeeklyBalance, generateWeeks } from "./finance";

let opSeq = 0;
function op(
  date: string,
  type: Operation["type"],
  status: Operation["status"],
  amount: number
): Operation {
  opSeq += 1;
  return {
    id: `op-${opSeq}`,
    date,
    type,
    status,
    categoryId: "c",
    accountId: "a",
    amount,
    description: ""
  };
}

// Хелпер для компактного описания недели плана/факта.
function week(
  weekStart: string,
  incomePlan: number,
  expensePlan: number,
  incomeActual = 0,
  expenseActual = 0
): WeekPlan {
  return { weekStart, incomePlan, expensePlan, incomeActual, expenseActual };
}

describe("generateWeeks", () => {
  it("строит недели с шагом 7 дней до конца года", () => {
    const weeks = generateWeeks("2026-07-08");
    expect(weeks).toHaveLength(26);
    expect(weeks[0]).toEqual({ index: 0, start: "2026-07-08", end: "2026-07-14" });
    expect(weeks[weeks.length - 1].start).toBe("2026-12-30");
  });

  it("включает неделю, если её начало не позже конца горизонта", () => {
    const weeks = generateWeeks("2026-07-08", "2026-07-28");
    expect(weeks.map((w) => w.start)).toEqual(["2026-07-08", "2026-07-15", "2026-07-22"]);
  });

  it("недели непрерывны: начало каждой = день после конца предыдущей", () => {
    const weeks = generateWeeks("2026-07-08");
    for (let i = 1; i < weeks.length; i += 1) {
      const prevEnd = new Date(`${weeks[i - 1].end}T00:00:00Z`).getTime();
      const start = new Date(`${weeks[i].start}T00:00:00Z`).getTime();
      expect(start - prevEnd).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("возвращает пустой список при мусорной дате или end < start", () => {
    expect(generateWeeks("не дата")).toEqual([]);
    expect(generateWeeks("2026-07-08", "2026-07-01")).toEqual([]);
  });
});

describe("balanceSeries", () => {
  it("переносит остаток недели на следующую (знаки план-нетто)", () => {
    const series = balanceSeries(10, [week("w1", 100, 40), week("w2", 0, 50)]);
    // w1: 10 + (100-40) = 70; w2: 70 + (0-50) = 20
    expect(series[0].balance).toBe(70);
    expect(series[1].openingBalance).toBe(70); // перенос остатка
    expect(series[1].balance).toBe(20);
  });

  it("факт переопределяет план, если по неделе есть факт", () => {
    const [row] = balanceSeries(0, [week("w", 100, 40, 30, 10)]);
    expect(row.planNet).toBe(60);
    expect(row.actualNet).toBe(20);
    expect(row.effectiveNet).toBe(20); // взят факт, не план
    expect(row.balance).toBe(20);
  });

  it("помечает недели с отрицательным балансом как кассовый разрыв", () => {
    const series = balanceSeries(30, [week("w1", 0, 50), week("w2", 100, 0)]);
    // w1: 30 - 50 = -20 (разрыв); w2: -20 + 100 = 80 (норма)
    expect(series[0].balance).toBe(-20);
    expect(series[0].isCashGap).toBe(true);
    expect(series[1].isCashGap).toBe(false);
  });

  it("пустой список недель даёт пустой результат", () => {
    expect(balanceSeries(1000, [])).toEqual([]);
  });
});

describe("aggregateWeeks", () => {
  const weeks = generateWeeks("2026-07-08", "2026-07-28"); // 08–14, 15–21, 22–28

  it("раскладывает операции по неделям и делит план/факт", () => {
    const plans = aggregateWeeks(
      [
        op("2026-07-08", "income", "actual", 100), // неделя 0, факт-доход
        op("2026-07-14", "expense", "actual", 30), // неделя 0, факт-расход (граница)
        op("2026-07-16", "expense", "planned", 50), // неделя 1, план-расход
        op("2026-07-22", "income", "planned", 200) // неделя 2, план-доход
      ],
      weeks
    );
    expect(plans[0]).toEqual({
      weekStart: "2026-07-08",
      incomePlan: 0,
      expensePlan: 0,
      incomeActual: 100,
      expenseActual: 30
    });
    expect(plans[1].expensePlan).toBe(50);
    expect(plans[2].incomePlan).toBe(200);
  });

  it("суммирует несколько операций в одной неделе", () => {
    const plans = aggregateWeeks(
      [op("2026-07-09", "expense", "actual", 10), op("2026-07-10", "expense", "actual", 15)],
      weeks
    );
    expect(plans[0].expenseActual).toBe(25);
  });

  it("исключает переводы и операции вне диапазона недель", () => {
    const plans = aggregateWeeks(
      [
        op("2026-07-09", "transfer", "actual", 500), // перевод — игнор
        op("2026-07-01", "expense", "actual", 40), // до первой недели — игнор
        op("2026-09-01", "expense", "actual", 70) // после последней недели — игнор
      ],
      weeks
    );
    for (const plan of plans) {
      expect(plan.incomePlan + plan.expensePlan + plan.incomeActual + plan.expenseActual).toBe(0);
    }
  });

  it("результат агрегации подаётся в balanceSeries", () => {
    const plans = aggregateWeeks(
      [op("2026-07-08", "income", "actual", 100), op("2026-07-16", "expense", "planned", 40)],
      weeks
    );
    const series = balanceSeries(0, plans);
    expect(series[0].balance).toBe(100); // факт-доход
    expect(series[1].balance).toBe(60); // 100 − 40 план-расход, перенос остатка
  });
});

describe("computeWeeklyBalance", () => {
  const accounts: Account[] = [
    { id: "a", name: "Карта", type: "card", balance: 1000 },
    { id: "b", name: "Наличные", type: "cash", balance: 500 }
  ];

  it("стартовый баланс = сумма балансов счетов", () => {
    const result = computeWeeklyBalance(null, accounts, []);
    expect(result.initialBalance).toBe(1500);
  });

  it("без даты старта недели не строятся", () => {
    const result = computeWeeklyBalance(null, accounts, [op("2026-07-08", "expense", "actual", 200)]);
    expect(result.weeks).toEqual([]);
  });

  it("считает цепочку баланса от суммы счетов", () => {
    const result = computeWeeklyBalance("2026-07-08", accounts, [
      op("2026-07-08", "expense", "actual", 200)
    ]);
    expect(result.weeks[0].openingBalance).toBe(1500);
    expect(result.weeks[0].balance).toBe(1300); // 1500 − 200
  });

  it("обрезает хвост пустых недель до минимума при активности только в начале", () => {
    // старт в начале года -> 53 недели, но активна только неделя 0
    const result = computeWeeklyBalance("2026-01-01", accounts, [
      op("2026-01-01", "expense", "actual", 200)
    ]);
    expect(result.weeks).toHaveLength(4); // минимум для контекста, а не 53
  });

  it("растягивает диапазон до последней активной недели", () => {
    // операция в неделе с индексом 10 (2026-01-01 + 70 дней = 2026-03-12)
    const result = computeWeeklyBalance("2026-01-01", accounts, [
      op("2026-03-12", "income", "planned", 500)
    ]);
    expect(result.weeks).toHaveLength(11); // недели 0..10 включительно
  });
});
