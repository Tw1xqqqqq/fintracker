import { describe, expect, it } from "vitest";
import type { RecurringRule } from "../types";
import {
  customRecurrenceLabel,
  customRecurrenceToRuleFields,
  ruleToCustomRecurrence
} from "./RecurrenceCustomDialog";
import { recurringRuleOccurrences } from "../lib/finance";

function baseRule(overrides: Partial<RecurringRule>): RecurringRule {
  return {
    id: "r",
    type: "expense",
    categoryId: "c",
    accountId: "a",
    amount: 100,
    recurrenceKind: "interval",
    intervalDays: 1,
    intervalUnit: "day",
    weekdays: null,
    monthlyMode: null,
    startDate: "2026-07-07", // вторник
    endDate: null,
    occurrenceCount: null,
    description: "",
    ...overrides
  };
}

describe("конвертация регулярности (единый интерфейс popover ↔ настройки)", () => {
  it("customRecurrenceToRuleFields: неделя с днями + окончание по количеству", () => {
    const fields = customRecurrenceToRuleFields({
      count: 2,
      unit: "week",
      weekdays: [1, 3],
      monthlyMode: "date",
      endMode: "count",
      endDate: "2026-12-31",
      repeatCount: 5
    });
    expect(fields).toEqual({
      recurrenceKind: "interval",
      intervalDays: 2,
      intervalUnit: "week",
      weekdays: [1, 3],
      monthlyMode: null,
      endDate: null,
      occurrenceCount: 5
    });
  });

  it("round-trip правило → custom → правило сохраняет генерацию дат", () => {
    const rule = baseRule({
      intervalDays: 1,
      intervalUnit: "week",
      weekdays: [1, 3],
      startDate: "2026-07-07"
    });
    const custom = ruleToCustomRecurrence(rule, "2026-12-31");
    const rebuilt = baseRule({ ...customRecurrenceToRuleFields(custom), startDate: rule.startDate });
    expect(recurringRuleOccurrences(rebuilt, "2026-07-20")).toEqual(
      recurringRuleOccurrences(rule, "2026-07-20")
    );
  });

  it("календарные виды переводятся в эквивалентный интервал", () => {
    expect(ruleToCustomRecurrence(baseRule({ recurrenceKind: "weekdays" }), "2026-12-31")).toMatchObject(
      { unit: "week", count: 1, weekdays: [1, 2, 3, 4, 5] }
    );
    expect(ruleToCustomRecurrence(baseRule({ recurrenceKind: "yearly" }), "2026-12-31")).toMatchObject(
      { unit: "year", count: 1 }
    );
  });

  it("customRecurrenceLabel даёт человекочитаемую подпись", () => {
    const label = customRecurrenceLabel(
      { count: 1, unit: "week", weekdays: [1, 3], monthlyMode: "date", endMode: "never", endDate: "", repeatCount: 11 },
      "2026-07-07"
    );
    expect(label).toBe("Еженедельно (Пн, Ср)");
  });
});
