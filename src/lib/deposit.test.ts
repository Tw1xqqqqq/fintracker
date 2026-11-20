import { describe, expect, it } from "vitest";
import type { Deposit, Operation } from "../types";
import {
  daysInYear,
  depositForecast,
  depositInterest,
  interestPlanId,
  isInterestPlanId,
  plannedInterest
} from "./deposit";

const base: Deposit = {
  accountId: "dep",
  rate: 12,
  openDate: "2026-01-01",
  closeDate: "2026-12-31",
  capitalization: "none",
  planInterest: false
};

let seq = 0;

// Пополнение и снятие — ноги перевода между своим счётом и вкладом.
function topUp(date: string, amount: number, status: Operation["status"] = "actual"): Operation {
  seq += 1;
  return {
    id: `t${seq}:in`,
    date,
    type: "transfer",
    status,
    categoryId: null,
    accountId: "dep",
    amount,
    description: "",
    sourceAccountId: "main",
    targetAccountId: "dep",
    transferId: `t${seq}`
  };
}

function withdraw(date: string, amount: number, status: Operation["status"] = "actual"): Operation {
  seq += 1;
  return {
    id: `t${seq}:out`,
    date,
    type: "transfer",
    status,
    categoryId: null,
    accountId: "dep",
    amount,
    description: "",
    sourceAccountId: "dep",
    targetAccountId: "main",
    transferId: `t${seq}`
  };
}

describe("daysInYear", () => {
  it("год считается фактический: 365 или 366 дней", () => {
    expect(daysInYear(2026)).toBe(365);
    expect(daysInYear(2028)).toBe(366);
    expect(daysInYear(2000)).toBe(366);
    expect(daysInYear(1900)).toBe(365);
  });
});

describe("depositInterest", () => {
  it("без пополнений: ставка 12% на 100 000 за 31 день января", () => {
    const result = depositInterest(base, 100000, [], "2026-01-01", "2026-01-31");
    // 100000 * 0.12 / 365 * 31 = 1019.18
    expect(result.accrued).toBe(1019.18);
    expect(result.days).toBe(31);
    expect(result.capitalized).toBe(0);
    expect(result.balance).toBe(100000);
  });

  it("пополнение в середине месяца увеличивает начисление со дня пополнения", () => {
    const result = depositInterest(base, 100000, [topUp("2026-01-16", 50000)], "2026-01-01", "2026-01-31");
    // 15 дней на 100000 + 16 дней на 150000
    const expected = (100000 * 0.12 * 15) / 365 + (150000 * 0.12 * 16) / 365;
    expect(result.accrued).toBeCloseTo(expected, 2);
    expect(result.balance).toBe(150000);
  });

  it("частичное снятие уменьшает начисление", () => {
    const full = depositInterest(base, 100000, [], "2026-01-01", "2026-01-31");
    const partial = depositInterest(
      base,
      100000,
      [withdraw("2026-01-16", 40000)],
      "2026-01-01",
      "2026-01-31"
    );
    expect(partial.accrued).toBeLessThan(full.accrued);
    expect(partial.balance).toBe(60000);
  });

  it("в високосный год та же сумма за год даёт меньше процентов в день", () => {
    const leap: Deposit = { ...base, openDate: "2028-01-01", closeDate: "2028-12-31" };
    const common = depositInterest(base, 100000, [], "2026-01-01", "2026-01-31");
    const leapYear = depositInterest(leap, 100000, [], "2028-01-01", "2028-01-31");
    expect(leapYear.accrued).toBeLessThan(common.accrued);
    expect(leapYear.accrued).toBe(1016.39);
  });

  it("ежемесячная капитализация добавляет проценты к телу вклада", () => {
    const monthly: Deposit = { ...base, capitalization: "monthly" };
    const result = depositInterest(monthly, 100000, [], "2026-01-01", "2026-02-15");
    expect(result.capitalized).toBe(1019.18); // январь закрылся
    expect(result.balance).toBeGreaterThan(100000);
    expect(result.pending).toBeGreaterThan(0); // февраль ещё не закрылся
  });

  it("капитализация меняет результат: на процент начисляется процент", () => {
    const none = depositInterest(base, 100000, [], "2026-01-01", "2026-12-31");
    const monthly = depositInterest(
      { ...base, capitalization: "monthly" },
      100000,
      [],
      "2026-01-01",
      "2026-12-31"
    );
    expect(monthly.accrued).toBeGreaterThan(none.accrued);
    expect(none.accrued).toBe(12000);
  });

  it("капитализация в конце срока добавляет проценты один раз, в день закрытия", () => {
    const atEnd: Deposit = { ...base, capitalization: "end" };
    const beforeClose = depositInterest(atEnd, 100000, [], "2026-01-01", "2026-12-30");
    const atCloseDate = depositInterest(atEnd, 100000, [], "2026-01-01", "2026-12-31");
    expect(beforeClose.capitalized).toBe(0);
    expect(atCloseDate.capitalized).toBe(12000);
    expect(atCloseDate.balance).toBe(112000);
  });

  it("после даты закрытия проценты не начисляются", () => {
    const result = depositInterest(base, 100000, [], "2026-01-01", "2027-06-30");
    expect(result.days).toBe(365);
    expect(result.accrued).toBe(12000);
  });

  it("до даты открытия проценты не начисляются", () => {
    const result = depositInterest(base, 100000, [], "2025-06-01", "2026-01-31");
    expect(result.days).toBe(31);
  });

  it("период целиком вне срока вклада даёт ноль", () => {
    const result = depositInterest(base, 100000, [], "2027-01-01", "2027-12-31");
    expect(result).toMatchObject({ accrued: 0, days: 0, balance: 100000 });
  });

  it("нулевая ставка и нулевой остаток процентов не дают", () => {
    expect(depositInterest({ ...base, rate: 0 }, 100000, [], "2026-01-01", "2026-12-31").accrued).toBe(0);
    expect(depositInterest(base, 0, [], "2026-01-01", "2026-12-31").accrued).toBe(0);
  });

  it("плановые пополнения учитываются только по запросу", () => {
    const planned = [topUp("2026-01-16", 50000, "planned")];
    const factOnly = depositInterest(base, 100000, planned, "2026-01-01", "2026-01-31");
    const withPlan = depositInterest(base, 100000, planned, "2026-01-01", "2026-01-31", {
      statuses: ["actual", "planned"]
    });
    expect(factOnly.accrued).toBe(1019.18);
    expect(withPlan.accrued).toBeGreaterThan(factOnly.accrued);
  });

  it("операции по другим счетам на вклад не влияют", () => {
    const other: Operation = {
      id: "x",
      date: "2026-01-10",
      type: "expense",
      status: "actual",
      categoryId: "food",
      accountId: "main",
      amount: 90000,
      description: ""
    };
    expect(depositInterest(base, 100000, [other], "2026-01-01", "2026-01-31").accrued).toBe(1019.18);
  });

  it("суммы округляются до копеек", () => {
    const result = depositInterest({ ...base, rate: 7.35 }, 33333, [], "2026-01-01", "2026-01-17");
    expect(result.accrued).toBe(Math.round(result.accrued * 100) / 100);
  });
});

describe("depositForecast", () => {
  it("показывает начисленное на сегодня, за месяц и к закрытию", () => {
    const forecast = depositForecast(base, 100000, [], "2026-02-10");
    expect(forecast.accruedToDate).toBe(1347.95); // 41 день
    expect(forecast.accruedThisMonth).toBe(328.77); // 10 дней февраля
    expect(forecast.accruedToClose).toBe(12000);
    expect(forecast.closeBalance).toBe(112000);
    expect(forecast.isClosed).toBe(false);
  });

  it("к закрытию учитывает плановые пополнения", () => {
    const withPlan = depositForecast(base, 100000, [topUp("2026-07-01", 100000, "planned")], "2026-02-10");
    expect(withPlan.accruedToClose).toBeGreaterThan(12000);
    expect(withPlan.accruedToDate).toBe(1347.95); // план на сегодня не влияет
  });

  it("вклад без срока не даёт ожидаемого к закрытию", () => {
    const forecast = depositForecast({ ...base, closeDate: null }, 100000, [], "2026-02-10");
    expect(forecast.accruedToClose).toBeNull();
    expect(forecast.closeBalance).toBeNull();
  });

  it("закрытый вклад помечается как закрытый", () => {
    const forecast = depositForecast(base, 100000, [], "2027-01-10");
    expect(forecast.isClosed).toBe(true);
    expect(forecast.accruedToDate).toBe(12000);
  });
});

describe("plannedInterest", () => {
  const planned: Deposit = { ...base, planInterest: true };

  it("выключенный переключатель не даёт плановых начислений", () => {
    expect(plannedInterest(base, 100000, [], "2026-01-01", "2026-06-30")).toEqual([]);
  });

  it("нулевая ставка не даёт плановых начислений", () => {
    const zero: Deposit = { ...planned, rate: 0 };
    expect(plannedInterest(zero, 100000, [], "2026-01-01", "2026-06-30")).toEqual([]);
  });

  it("ставит выплату в последний день каждого месяца", () => {
    const plan = plannedInterest(planned, 100000, [], "2026-01-01", "2026-03-31");
    expect(plan.map((item) => item.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("сумма первой выплаты равна процентам за январь", () => {
    const plan = plannedInterest(planned, 100000, [], "2026-01-01", "2026-01-31");
    // 31 день по 100000 × 12 % / 365
    expect(plan[0].amount).toBe(1019.18);
  });

  it("каждая выплата — только проценты своего месяца, без накопления", () => {
    const plan = plannedInterest(planned, 100000, [], "2026-01-01", "2026-02-28");
    const february = depositInterest(planned, 100000, [], "2026-02-01", "2026-02-28").accrued;
    expect(plan[1].amount).toBe(february);
  });

  it("капитализация «в конце срока» даёт одну выплату в день закрытия", () => {
    const atEnd: Deposit = { ...planned, capitalization: "end" };
    const plan = plannedInterest(atEnd, 100000, [], "2026-01-01", "2026-12-31");
    expect(plan).toHaveLength(1);
    expect(plan[0].date).toBe("2026-12-31");
  });

  it("бессрочный вклад с капитализацией «в конце срока» плана не даёт", () => {
    const atEnd: Deposit = { ...planned, capitalization: "end", closeDate: null };
    expect(plannedInterest(atEnd, 100000, [], "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("дата закрытия в середине месяца добавляется отдельной выплатой", () => {
    const short: Deposit = { ...planned, closeDate: "2026-03-10" };
    const plan = plannedInterest(short, 100000, [], "2026-01-01", "2026-12-31");
    expect(plan.map((item) => item.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-10"]);
  });

  it("после даты закрытия выплат нет", () => {
    const short: Deposit = { ...planned, closeDate: "2026-02-15" };
    const plan = plannedInterest(short, 100000, [], "2026-01-01", "2026-12-31");
    expect(plan.every((item) => item.date <= "2026-02-15")).toBe(true);
  });

  it("плановое пополнение увеличивает следующие выплаты", () => {
    const withTopUp = plannedInterest(
      planned,
      100000,
      [topUp("2026-02-01", 100000, "planned")],
      "2026-01-01",
      "2026-02-28"
    );
    const without = plannedInterest(planned, 100000, [], "2026-01-01", "2026-02-28");
    expect(withTopUp[1].amount).toBeGreaterThan(without[1].amount);
  });

  it("выплаты раньше from в план не попадают, но суммы следующих не растут", () => {
    const all = plannedInterest(planned, 100000, [], "2026-01-01", "2026-03-31");
    const fromMarch = plannedInterest(planned, 100000, [], "2026-03-01", "2026-03-31");
    expect(fromMarch).toHaveLength(1);
    expect(fromMarch[0].amount).toBe(all[2].amount);
  });

  it("собственные плановые начисления в расчёт не берутся", () => {
    const own: Operation = {
      id: interestPlanId("dep", "2026-01-31"),
      date: "2026-01-31",
      type: "income",
      status: "planned",
      categoryId: "interest",
      accountId: "dep",
      amount: 1019.18,
      description: "Проценты по вкладу"
    };
    const withOwn = plannedInterest(planned, 100000, [own], "2026-01-01", "2026-02-28");
    const without = plannedInterest(planned, 100000, [], "2026-01-01", "2026-02-28");
    expect(withOwn).toEqual(without);
  });

  it("идентификатор детерминированный", () => {
    const plan = plannedInterest(planned, 100000, [], "2026-01-01", "2026-01-31");
    expect(plan[0].id).toBe("dep-interest:dep:2026-01-31");
    expect(isInterestPlanId(plan[0].id)).toBe(true);
  });
});
