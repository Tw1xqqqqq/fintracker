import { describe, expect, it } from "vitest";
import type { CreditCard, Operation } from "../types";
import {
  creditCardState,
  plannedRepayments,
  repaymentDraft,
  statementDateOnOrAfter
} from "./credit";

const card: CreditCard = {
  accountId: "cc",
  creditLimit: 100000,
  statementDay: 15,
  paymentDays: 20,
  repayBufferDays: 3
};

let seq = 0;
function purchase(date: string, amount: number, status: Operation["status"] = "actual"): Operation {
  seq += 1;
  return {
    id: `p${seq}`,
    date,
    type: "expense",
    status,
    categoryId: "food",
    accountId: "cc",
    amount,
    description: ""
  };
}

// Погашение — входящая нога перевода «основной счёт → кредитка».
function repay(date: string, amount: number): Operation {
  seq += 1;
  return {
    id: `t${seq}:in`,
    date,
    type: "transfer",
    status: "actual",
    categoryId: null,
    accountId: "cc",
    amount,
    description: "",
    sourceAccountId: "main",
    targetAccountId: "cc",
    transferId: `t${seq}`
  };
}

const SINCE = "2026-09-01";

describe("statementDateOnOrAfter", () => {
  it("выписка в тот же день включительно, после неё — в следующем месяце", () => {
    expect(statementDateOnOrAfter("2026-10-14", 15)).toBe("2026-10-15");
    expect(statementDateOnOrAfter("2026-10-15", 15)).toBe("2026-10-15");
    expect(statementDateOnOrAfter("2026-10-16", 15)).toBe("2026-11-15");
  });

  it("день выписки 31 в коротком месяце — последний день месяца", () => {
    expect(statementDateOnOrAfter("2026-02-10", 31)).toBe("2026-02-28");
    expect(statementDateOnOrAfter("2026-03-01", 31)).toBe("2026-03-31");
    expect(statementDateOnOrAfter("2026-12-31", 31)).toBe("2026-12-31");
  });
});

describe("creditCardState", () => {
  it("покупка до выписки попадает в выписку, дата платежа = выписка + платёжный период", () => {
    const state = creditCardState(card, 0, [purchase("2026-10-10", 5000)], SINCE, "2026-10-20");
    expect(state.nextDue).toMatchObject({
      periodStart: "2026-09-16",
      statementDate: "2026-10-15",
      dueDate: "2026-11-04",
      payBy: "2026-11-01",
      statementDebt: 5000,
      remaining: 5000,
      overdue: false
    });
    expect(state.status).toBe("due");
    expect(state.daysLeft).toBe(15);
    expect(state.debt).toBe(5000);
    expect(state.available).toBe(95000);
  });

  it("покупка в день выписки входит в неё, на следующий день — уже в новый период", () => {
    const state = creditCardState(
      card,
      0,
      [purchase("2026-10-15", 1000), purchase("2026-10-16", 700)],
      SINCE,
      "2026-10-20"
    );
    expect(state.nextDue?.statementDebt).toBe(1000);
    expect(state.currentPeriod).toEqual({ start: "2026-10-16", statementDate: "2026-11-15", spent: 700 });
    expect(state.debt).toBe(1700);
  });

  it("частичное погашение уменьшает остаток к оплате", () => {
    const state = creditCardState(
      card,
      0,
      [purchase("2026-10-10", 5000), repay("2026-10-25", 2000)],
      SINCE,
      "2026-10-26"
    );
    expect(state.nextDue).toMatchObject({ statementDebt: 5000, paid: 2000, remaining: 3000 });
    expect(state.status).toBe("due");
  });

  it("полное погашение закрывает выписку; новые покупки — накопление в текущем периоде", () => {
    const state = creditCardState(
      card,
      0,
      [purchase("2026-10-10", 5000), purchase("2026-10-18", 800), repay("2026-10-25", 5000)],
      SINCE,
      "2026-10-26"
    );
    expect(state.nextDue).toBeNull();
    expect(state.status).toBe("period");
    expect(state.debt).toBe(800);
  });

  it("за 5 дней до даты платежа — статус «скоро»", () => {
    const state = creditCardState(card, 0, [purchase("2026-10-10", 5000)], SINCE, "2026-10-31");
    expect(state.status).toBe("soon");
    expect(state.daysLeft).toBe(4);
  });

  it("дата платежа прошла, выписка не погашена — просрочка", () => {
    const state = creditCardState(card, 0, [purchase("2026-10-10", 5000)], SINCE, "2026-11-05");
    expect(state.nextDue?.overdue).toBe(true);
    expect(state.status).toBe("overdue");
    expect(state.daysLeft).toBe(-1);
  });

  it("просрочка прошлой выписки сохраняется, пока долг не погашен", () => {
    const state = creditCardState(card, 0, [purchase("2026-09-10", 1000)], SINCE, "2026-10-20");
    expect(state.statements.map((s) => s.overdue)).toEqual([true, false]);
    expect(state.status).toBe("overdue");
  });

  it("погашение до выписки уменьшает долг на дату выписки", () => {
    const state = creditCardState(
      card,
      0,
      [purchase("2026-10-01", 5000), repay("2026-10-10", 5000)],
      SINCE,
      "2026-10-20"
    );
    expect(state.nextDue).toBeNull();
    expect(state.status).toBe("clear");
  });

  it("стартовый долг входит в первую выписку", () => {
    const state = creditCardState(card, 3000, [], "2026-10-01", "2026-10-20");
    expect(state.nextDue).toMatchObject({ statementDate: "2026-10-15", statementDebt: 3000 });
  });

  it("не учитывает плановые операции и операции других счетов", () => {
    const other = { ...purchase("2026-10-10", 9000), accountId: "main" };
    const state = creditCardState(
      card,
      0,
      [other, purchase("2026-10-11", 4000, "planned")],
      SINCE,
      "2026-10-20"
    );
    expect(state.debt).toBe(0);
    expect(state.status).toBe("clear");
  });
});

describe("plannedRepayments", () => {
  it("ставит погашение на дату платежа минус буфер, на сумму выписки", () => {
    const plan = plannedRepayments(card, 0, [purchase("2026-10-10", 5000)], SINCE, "2026-11-30");
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      id: "cc-repay:cc:2026-10-15",
      statementDate: "2026-10-15",
      dueDate: "2026-11-04",
      date: "2026-11-01",
      amount: 5000
    });
  });

  it("покупка до выписки увеличивает её, покупка после уходит в следующую", () => {
    const plan = plannedRepayments(
      card,
      0,
      [purchase("2026-10-10", 5000), purchase("2026-10-14", 1000), purchase("2026-10-20", 700)],
      SINCE,
      "2026-11-30"
    );
    expect(plan.map((item) => [item.statementDate, item.amount])).toEqual([
      ["2026-10-15", 6000],
      ["2026-11-15", 700]
    ]);
  });

  it("учитывает плановые покупки, а не только факт", () => {
    const plan = plannedRepayments(
      card,
      0,
      [purchase("2026-10-10", 4000, "planned")],
      SINCE,
      "2026-11-30"
    );
    expect(plan[0].amount).toBe(4000);
  });

  it("полное погашение убирает плановый перевод", () => {
    const plan = plannedRepayments(
      card,
      0,
      [purchase("2026-10-10", 5000), repay("2026-10-20", 5000)],
      SINCE,
      "2026-11-30"
    );
    expect(plan).toHaveLength(0);
  });

  it("частичное погашение уменьшает плановую сумму", () => {
    const plan = plannedRepayments(
      card,
      0,
      [purchase("2026-10-10", 5000), repay("2026-10-20", 2000)],
      SINCE,
      "2026-11-30"
    );
    expect(plan[0].amount).toBe(3000);
  });

  it("платёж после даты платежа плановую сумму выписки не уменьшает", () => {
    const plan = plannedRepayments(
      card,
      0,
      [purchase("2026-10-10", 5000), repay("2026-11-10", 5000)],
      SINCE,
      "2026-11-30"
    );
    expect(plan[0].amount).toBe(5000);
  });

  it("сам плановый перевод погашения в расчёт выписки не входит", () => {
    const auto: Operation = {
      id: "cc-repay:cc:2026-10-15",
      date: "2026-11-01",
      type: "transfer",
      status: "planned",
      categoryId: null,
      accountId: "cc",
      amount: 5000,
      description: "",
      sourceAccountId: "main",
      targetAccountId: "cc",
      transferId: "cc-repay:cc:2026-10-15"
    };
    const plan = plannedRepayments(card, 0, [purchase("2026-10-10", 5000), auto], SINCE, "2026-11-30");
    expect(plan).toHaveLength(1);
    expect(plan[0].amount).toBe(5000);
  });

  it("id детерминированный: повторный расчёт даёт те же записи", () => {
    const operations = [purchase("2026-10-10", 5000)];
    const first = plannedRepayments(card, 0, operations, SINCE, "2026-11-30");
    const second = plannedRepayments(card, 0, operations, SINCE, "2026-11-30");
    expect(first).toEqual(second);
  });

  it("стартовый долг попадает в первую выписку", () => {
    const plan = plannedRepayments(card, 3000, [], "2026-10-01", "2026-10-31");
    expect(plan[0]).toMatchObject({ statementDate: "2026-10-15", amount: 3000 });
  });

  it("без долга плана нет", () => {
    expect(plannedRepayments(card, 0, [], SINCE, "2026-12-31")).toEqual([]);
  });

  it("горизонт раньше начала учёта плана не даёт", () => {
    expect(plannedRepayments(card, 5000, [], "2026-10-01", "2026-09-01")).toEqual([]);
  });
});

describe("repaymentDraft", () => {
  it("по непогашенной выписке подставляет её остаток", () => {
    const state = creditCardState(card, 0, [purchase("2026-10-10", 12500)], "2026-10-01", "2026-11-05");
    const draft = repaymentDraft(state, "2026-11-05", "actual");
    expect(draft.target).toBe("statement");
    expect(draft.amount).toBe(12500);
    expect(draft.statementDate).toBe("2026-10-15");
    expect(draft.dueDate).toBe("2026-11-04");
  });

  it("для факта датой берётся сегодня", () => {
    const state = creditCardState(card, 0, [purchase("2026-10-10", 12500)], "2026-10-01", "2026-10-20");
    expect(repaymentDraft(state, "2026-10-20", "actual").date).toBe("2026-10-20");
  });

  it("для плана датой берётся payBy — дата платежа минус буфер", () => {
    const state = creditCardState(card, 0, [purchase("2026-10-10", 12500)], "2026-10-01", "2026-10-20");
    // выписка 15.10, платёж 04.11, буфер 3 дня
    expect(repaymentDraft(state, "2026-10-20", "planned").date).toBe("2026-11-01");
  });

  it("если payBy уже прошёл, план ставится на сегодня", () => {
    const state = creditCardState(card, 0, [purchase("2026-10-10", 12500)], "2026-10-01", "2026-11-03");
    expect(repaymentDraft(state, "2026-11-03", "planned").date).toBe("2026-11-03");
  });

  it("частичное погашение уменьшает подставляемую сумму", () => {
    const state = creditCardState(
      card,
      0,
      [purchase("2026-10-10", 12500), repay("2026-10-20", 2500)],
      "2026-10-01",
      "2026-11-01"
    );
    expect(repaymentDraft(state, "2026-11-01", "actual").amount).toBe(10000);
  });

  it("без выписки, но с долгом текущего периода подставляет весь долг", () => {
    const state = creditCardState(card, 0, [purchase("2026-10-16", 3000)], "2026-10-01", "2026-10-20");
    const draft = repaymentDraft(state, "2026-10-20", "actual");
    expect(draft.target).toBe("debt");
    expect(draft.amount).toBe(3000);
    expect(draft.statementDate).toBeNull();
  });

  it("долга нет — гасить нечего", () => {
    const state = creditCardState(card, 0, [], "2026-10-01", "2026-10-20");
    const draft = repaymentDraft(state, "2026-10-20", "actual");
    expect(draft.target).toBe("none");
    expect(draft.amount).toBe(0);
  });

  it("выписка погашена полностью — предлагается только остаток текущего периода", () => {
    const state = creditCardState(
      card,
      0,
      [purchase("2026-10-10", 12500), repay("2026-10-20", 12500), purchase("2026-10-25", 4000)],
      "2026-10-01",
      "2026-11-01"
    );
    const draft = repaymentDraft(state, "2026-11-01", "actual");
    expect(draft.target).toBe("debt");
    expect(draft.amount).toBe(4000);
  });
});
