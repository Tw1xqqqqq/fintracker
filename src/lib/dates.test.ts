import { afterEach, describe, expect, it } from "vitest";
import { formatLongDate, newId, shortDate, todayIso } from "./dates";

const originalTz = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTz;
});

describe("todayIso", () => {
  it("берёт дату по локальному времени, а не по UTC", () => {
    process.env.TZ = "Europe/Moscow";
    // 01:30 по МСК 19 октября = 22:30 UTC 18 октября
    const now = new Date("2026-10-18T22:30:00Z");
    expect(todayIso(now)).toBe("2026-10-19");
  });

  it("дополняет месяц и день нулями", () => {
    expect(todayIso(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});

describe("shortDate", () => {
  it("формат дд.мм", () => {
    expect(shortDate("2026-10-19")).toBe("19.10");
  });

  it("нестандартную строку возвращает как есть", () => {
    expect(shortDate("19.10.2026")).toBe("19.10.2026");
  });
});

describe("formatLongDate", () => {
  it("не сдвигает день западнее Гринвича", () => {
    process.env.TZ = "America/New_York";
    expect(formatLongDate("2026-10-19")).toContain("19 октября 2026");
  });

  it("пустая строка — прочерк, мусор — как есть", () => {
    expect(formatLongDate("")).toBe("—");
    expect(formatLongDate("не дата")).toBe("не дата");
  });
});

describe("newId", () => {
  it("выдаёт разные id", () => {
    expect(newId("op")).not.toBe(newId("op"));
  });
});
