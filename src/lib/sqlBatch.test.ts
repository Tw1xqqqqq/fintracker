import { describe, expect, it } from "vitest";
import { buildInsertBatches } from "./sqlBatch";

const PREFIX = "INSERT INTO operations (id, date, amount)";

describe("buildInsertBatches", () => {
  it("пустой список строк не даёт запросов", () => {
    expect(buildInsertBatches(PREFIX, [])).toEqual([]);
  });

  it("одна строка — один запрос с нумерованными параметрами", () => {
    expect(buildInsertBatches(PREFIX, [["a", "2026-11-05", 100]])).toEqual([
      { sql: `${PREFIX} VALUES ($1, $2, $3)`, params: ["a", "2026-11-05", 100] }
    ]);
  });

  it("несколько строк уходят одним многострочным INSERT", () => {
    const batches = buildInsertBatches(PREFIX, [
      ["a", "2026-11-05", 100],
      ["b", "2026-11-06", 200]
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0].sql).toBe(`${PREFIX} VALUES ($1, $2, $3), ($4, $5, $6)`);
    expect(batches[0].params).toEqual(["a", "2026-11-05", 100, "b", "2026-11-06", 200]);
  });

  it("разбивает на пакеты по лимиту параметров", () => {
    const rows = Array.from({ length: 5 }, (_, i) => [`id${i}`, "2026-11-05", i]);
    const batches = buildInsertBatches(PREFIX, rows, 6); // 6 / 3 столбца = 2 строки в пакете
    expect(batches.map((batch) => batch.params.length)).toEqual([6, 6, 3]);
    expect(batches[2].sql).toBe(`${PREFIX} VALUES ($1, $2, $3)`);
  });

  it("нумерация параметров в каждом пакете начинается с единицы", () => {
    const rows = Array.from({ length: 4 }, (_, i) => [`id${i}`, "2026-11-05", i]);
    const batches = buildInsertBatches(PREFIX, rows, 3);
    expect(batches).toHaveLength(4);
    for (const batch of batches) {
      expect(batch.sql).toBe(`${PREFIX} VALUES ($1, $2, $3)`);
    }
  });

  it("при лимите меньше одной строки пакет всё равно содержит строку целиком", () => {
    const batches = buildInsertBatches(PREFIX, [["a", "2026-11-05", 100]], 2);
    expect(batches).toHaveLength(1);
    expect(batches[0].params).toHaveLength(3);
  });

  it("тысяча строк по умолчанию укладывается в несколько пакетов, а не в тысячу запросов", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => [`id${i}`, "2026-11-05", i]);
    const batches = buildInsertBatches(PREFIX, rows);
    expect(batches).toHaveLength(4); // 300 строк в пакете при лимите 900 параметров
    expect(batches.every((batch) => batch.params.length <= 900)).toBe(true);
    const total = batches.reduce((sum, batch) => sum + batch.params.length, 0);
    expect(total).toBe(3000);
  });

  it("строки разной длины — ошибка, а не битый запрос", () => {
    expect(() => buildInsertBatches(PREFIX, [["a", "b", 1], ["c", 2]])).toThrow(
      /одинаковое число значений/
    );
  });

  it("строки без значений запросов не дают", () => {
    expect(buildInsertBatches(PREFIX, [[]])).toEqual([]);
  });

  it("значения попадают в параметры, а не в текст запроса", () => {
    const batches = buildInsertBatches(PREFIX, [["'; DROP TABLE operations; --", "2026-11-05", 0]]);
    expect(batches[0].sql).not.toContain("DROP");
    expect(batches[0].params[0]).toBe("'; DROP TABLE operations; --");
  });
});
