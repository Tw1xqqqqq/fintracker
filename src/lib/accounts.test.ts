import { describe, expect, it } from "vitest";
import type { Account, Operation } from "../types";
import {
  accountGroup,
  creditDebtAt,
  groupAccounts,
  groupBalancesAt,
  initialGroupBalance,
  liquidBalanceAt,
  liquidBalanceSeries,
  liquidWeekFlows,
  operationTouchesAccount,
  transferFlows
} from "./accounts";

const accounts: Account[] = [
  { id: "cash", name: "Наличные", type: "cash", balance: 10000 },
  { id: "main", name: "Дебетовая", type: "card", balance: 50000 },
  { id: "dep", name: "Вклад", type: "savings", balance: 100000 },
  { id: "cc", name: "Кредитка", type: "credit", balance: 0 }
];

let seq = 0;

function op(partial: Partial<Operation> & { accountId: string; amount: number }): Operation {
  seq += 1;
  return {
    id: `op${seq}`,
    date: "2026-11-05",
    type: "expense",
    status: "actual",
    categoryId: "food",
    description: "",
    ...partial
  } as Operation;
}

// Перевод хранится двумя ногами с общим transfer_id.
function transfer(
  from: string,
  to: string,
  amount: number,
  date = "2026-11-05",
  status: Operation["status"] = "actual"
): Operation[] {
  seq += 1;
  const id = `t${seq}`;
  const common = {
    date,
    type: "transfer" as const,
    status,
    categoryId: null,
    amount,
    description: "",
    sourceAccountId: from,
    targetAccountId: to,
    transferId: id
  };
  return [
    { ...common, id: `${id}:out`, accountId: from },
    { ...common, id: `${id}:in`, accountId: to }
  ];
}

describe("accountGroup", () => {
  it("наличные и карта — свободные деньги, вклад — депозит, кредитка — кредит", () => {
    expect(accounts.map(accountGroup)).toEqual(["liquid", "liquid", "deposit", "credit"]);
  });

  it("разбивает счета по группам", () => {
    const groups = groupAccounts(accounts);
    expect(groups.liquid.map((a) => a.id)).toEqual(["cash", "main"]);
    expect(groups.deposit.map((a) => a.id)).toEqual(["dep"]);
    expect(groups.credit.map((a) => a.id)).toEqual(["cc"]);
  });

  it("стартовый баланс группы — сумма балансов её счетов", () => {
    expect(initialGroupBalance(accounts, "liquid")).toBe(60000);
    expect(initialGroupBalance(accounts, "deposit")).toBe(100000);
  });
});

describe("groupBalancesAt", () => {
  it("без операций берёт стартовые балансы счетов", () => {
    expect(groupBalancesAt(accounts, [])).toEqual({
      liquid: 60000,
      deposit: 100000,
      debt: 0,
      netWorth: 160000
    });
  });

  it("покупка по кредитке не уменьшает свободные деньги, а увеличивает долг", () => {
    const state = groupBalancesAt(accounts, [op({ accountId: "cc", amount: 5000 })]);
    expect(state.liquid).toBe(60000);
    expect(state.debt).toBe(5000);
    expect(state.netWorth).toBe(155000);
  });

  it("покупка со своей карты уменьшает свободные деньги", () => {
    const state = groupBalancesAt(accounts, [op({ accountId: "main", amount: 5000 })]);
    expect(state.liquid).toBe(55000);
    expect(state.debt).toBe(0);
  });

  it("погашение кредитки уменьшает и свободные деньги, и долг", () => {
    const operations = [
      op({ accountId: "cc", amount: 5000 }),
      ...transfer("main", "cc", 5000, "2026-11-10")
    ];
    const state = groupBalancesAt(accounts, operations);
    expect(state.liquid).toBe(55000);
    expect(state.debt).toBe(0);
    expect(state.netWorth).toBe(155000);
  });

  it("перевод на вклад уменьшает свободные деньги, но не капитал", () => {
    const state = groupBalancesAt(accounts, transfer("main", "dep", 20000));
    expect(state.liquid).toBe(40000);
    expect(state.deposit).toBe(120000);
    expect(state.netWorth).toBe(160000);
  });

  it("снятие с вклада возвращает деньги в свободные", () => {
    const state = groupBalancesAt(accounts, transfer("dep", "main", 30000));
    expect(state.liquid).toBe(90000);
    expect(state.deposit).toBe(70000);
    expect(state.netWorth).toBe(160000);
  });

  it("учитывает операции только по указанную дату включительно", () => {
    const operations = [
      op({ accountId: "main", amount: 1000, date: "2026-11-04" }),
      op({ accountId: "main", amount: 2000, date: "2026-11-06" })
    ];
    expect(liquidBalanceAt(accounts, operations, "2026-11-05")).toBe(59000);
    expect(liquidBalanceAt(accounts, operations, "2026-11-06")).toBe(57000);
  });

  it("не учитывает плановые операции", () => {
    const planned = op({ accountId: "main", amount: 9000, status: "planned" });
    expect(liquidBalanceAt(accounts, [planned])).toBe(60000);
  });

  it("переплата по одной карте не уменьшает долг по другой", () => {
    const twoCards: Account[] = [
      ...accounts,
      { id: "cc2", name: "Кредитка 2", type: "credit", balance: 0 }
    ];
    const operations = [
      op({ accountId: "cc", amount: 1000 }),
      ...transfer("main", "cc2", 3000)
    ];
    expect(creditDebtAt(twoCards, operations)).toBe(1000);
  });
});

describe("transferFlows", () => {
  const operations = [
    ...transfer("main", "dep", 20000, "2026-11-03"),
    ...transfer("dep", "cash", 5000, "2026-11-04"),
    ...transfer("main", "cc", 7000, "2026-11-05"),
    ...transfer("main", "cc", 1000, "2026-11-06"),
    ...transfer("main", "dep", 1000, "2026-11-20"),
    ...transfer("main", "cc", 500, "2026-11-05", "planned")
  ];

  it("считает потоки на вклады, с вкладов и погашение по каждой карте", () => {
    const flows = transferFlows(accounts, operations, "actual", "2026-11-02", "2026-11-08");
    expect(flows.toDeposit).toBe(20000);
    expect(flows.fromDeposit).toBe(5000);
    expect(flows.repayByCard.get("cc")).toBe(8000);
  });

  it("не смешивает план и факт", () => {
    const flows = transferFlows(accounts, operations, "planned", "2026-11-02", "2026-11-08");
    expect(flows.toDeposit).toBe(0);
    expect(flows.repayByCard.get("cc")).toBe(500);
  });

  it("каждый перевод учитывается один раз, обе ноги не складываются", () => {
    const flows = transferFlows(accounts, transfer("main", "dep", 100), "actual", "2026-11-01", "2026-11-30");
    expect(flows.toDeposit).toBe(100);
  });

  it("переводы между своими счетами в потоки не попадают", () => {
    const flows = transferFlows(accounts, transfer("main", "cash", 1000), "actual", "2026-11-01", "2026-11-30");
    expect(flows).toMatchObject({ toDeposit: 0, fromDeposit: 0 });
    expect(flows.repayByCard.size).toBe(0);
  });
});

const weeks = [
  { start: "2026-11-02", end: "2026-11-08" },
  { start: "2026-11-09", end: "2026-11-15" },
  { start: "2026-11-16", end: "2026-11-22" }
];

describe("liquidWeekFlows", () => {
  it("раскладывает доход и расход по свободным счетам по неделям", () => {
    const operations = [
      op({ accountId: "main", amount: 30000, type: "income", date: "2026-11-03" }),
      op({ accountId: "cash", amount: 4000, date: "2026-11-04" }),
      op({ accountId: "main", amount: 1000, date: "2026-11-10" })
    ];
    const flows = liquidWeekFlows(accounts, operations, weeks);
    expect(flows[0]).toMatchObject({ incomeActual: 30000, expenseActual: 4000, hasActual: true });
    expect(flows[1]).toMatchObject({ expenseActual: 1000 });
    expect(flows[2]).toMatchObject({ expenseActual: 0, hasActual: false });
  });

  it("покупка по кредитке в движение свободных денег не попадает", () => {
    const flows = liquidWeekFlows(accounts, [op({ accountId: "cc", amount: 7000, date: "2026-11-03" })], weeks);
    expect(flows[0]).toMatchObject({ expenseActual: 0, hasActual: false });
  });

  it("перевод на вклад — отток, снятие с вклада — приток", () => {
    const operations = [
      ...transfer("main", "dep", 20000, "2026-11-03"),
      ...transfer("dep", "cash", 5000, "2026-11-10")
    ];
    const flows = liquidWeekFlows(accounts, operations, weeks);
    expect(flows[0].transferOutActual).toBe(20000);
    expect(flows[1].transferOutActual).toBe(-5000);
  });

  it("перевод между своими счетами движения не даёт", () => {
    const flows = liquidWeekFlows(accounts, transfer("main", "cash", 3000, "2026-11-03"), weeks);
    expect(flows[0].transferOutActual).toBe(0);
  });

  it("погашение кредитки — отток свободных денег", () => {
    const flows = liquidWeekFlows(accounts, transfer("main", "cc", 8000, "2026-11-03"), weeks);
    expect(flows[0].transferOutActual).toBe(8000);
  });

  it("план и факт считаются отдельно", () => {
    const operations = [
      ...transfer("main", "dep", 10000, "2026-11-03", "planned"),
      op({ accountId: "main", amount: 2000, date: "2026-11-04", status: "planned" })
    ];
    const flows = liquidWeekFlows(accounts, operations, weeks);
    expect(flows[0]).toMatchObject({
      transferOutPlan: 10000,
      expensePlan: 2000,
      transferOutActual: 0,
      hasActual: false
    });
  });
});

describe("liquidBalanceSeries", () => {
  it("переводы на вклад уменьшают итоговый баланс, покупки по кредитке — нет", () => {
    const operations = [
      ...transfer("main", "dep", 20000, "2026-11-03"),
      op({ accountId: "cc", amount: 15000, date: "2026-11-04" })
    ];
    const flows = liquidWeekFlows(accounts, operations, weeks);
    const series = liquidBalanceSeries(60000, flows);
    expect(series.effective).toEqual([40000, 40000, 40000]);
  });

  it("остаток переносится на следующую неделю", () => {
    const operations = [
      op({ accountId: "main", amount: 10000, type: "income", date: "2026-11-03" }),
      op({ accountId: "main", amount: 4000, date: "2026-11-10" })
    ];
    const series = liquidBalanceSeries(0, liquidWeekFlows(accounts, operations, weeks));
    expect(series.effective).toEqual([10000, 6000, 6000]);
  });

  it("неделя без факта считается от фактического остатка прошлой недели", () => {
    const operations = [
      op({ accountId: "main", amount: 25000, date: "2026-11-03" }),
      op({ accountId: "main", amount: 5000, date: "2026-11-10", status: "planned" })
    ];
    const flows = liquidWeekFlows(accounts, operations, weeks);
    const series = liquidBalanceSeries(60000, flows);
    expect(series.plan).toEqual([60000, 55000, 55000]);
    expect(series.effective).toEqual([35000, 30000, 30000]);
  });

  it("кассовый разрыв виден по свободным деньгам", () => {
    const operations = transfer("main", "dep", 70000, "2026-11-03");
    const series = liquidBalanceSeries(60000, liquidWeekFlows(accounts, operations, weeks));
    expect(series.effective[0]).toBe(-10000);
  });
});

describe("operationTouchesAccount", () => {
  it("обычный расход относится к своему счёту", () => {
    const expense = op({ accountId: "main", amount: 1000 });
    expect(operationTouchesAccount(expense, "main")).toBe(true);
    expect(operationTouchesAccount(expense, "cash")).toBe(false);
  });

  it("перевод относится к обоим счетам, с какой бы ноги ни смотрели", () => {
    const [out, incoming] = transfer("main", "cc", 12500, "2026-01-10");
    for (const leg of [out, incoming]) {
      expect(operationTouchesAccount(leg, "main")).toBe(true);
      expect(operationTouchesAccount(leg, "cc")).toBe(true);
      expect(operationTouchesAccount(leg, "dep")).toBe(false);
    }
  });

  it("погашение кредитки видно по фильтру самой карты", () => {
    const [out] = transfer("main", "cc", 12500, "2026-01-10");
    // в журнале остаётся только нога списания — она всё равно должна найтись
    expect(operationTouchesAccount(out, "cc")).toBe(true);
  });

  it("пополнение вклада видно по фильтру вклада", () => {
    const [out] = transfer("main", "dep", 10000, "2026-01-10");
    expect(operationTouchesAccount(out, "dep")).toBe(true);
  });
});
