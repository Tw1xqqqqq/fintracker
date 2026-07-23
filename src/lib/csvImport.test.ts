import { describe, expect, it } from "vitest";
import type { Account, Category, Operation } from "../types";
import {
  buildImportRows,
  buildOperationsCsv,
  decodeCsvBuffer,
  detectDelimiter,
  guessColumns,
  parseAmount,
  parseCsv,
  parseFlexibleDate
} from "./csvImport";

describe("decodeCsvBuffer", () => {
  it("читает utf-8 как есть", () => {
    const buffer = new TextEncoder().encode("Дата;Сумма\n15.07.2026;-500").buffer;
    expect(decodeCsvBuffer(buffer)).toContain("Дата");
  });

  it("падает обратно на windows-1251 при мусоре в utf-8", () => {
    // «Продукты» в cp1251
    const bytes = new Uint8Array([0xcf, 0xf0, 0xee, 0xe4, 0xf3, 0xea, 0xf2, 0xfb]);
    expect(decodeCsvBuffer(bytes.buffer)).toBe("Продукты");
  });
});

describe("detectDelimiter / parseCsv", () => {
  it("определяет ; и , как разделители", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
  });

  it("разбирает поля в кавычках с разделителем и экранированной кавычкой внутри", () => {
    const rows = parseCsv('15.07.2026;"Кафе ""У дома""; ул. Мира";-350');
    expect(rows).toEqual([["15.07.2026", 'Кафе "У дома"; ул. Мира', "-350"]]);
  });

  it("пропускает пустые строки и понимает CRLF", () => {
    const rows = parseCsv("a;b\r\n\r\n1;2\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"]
    ]);
  });
});

describe("parseAmount", () => {
  it.each([
    ["1 234,56", 1234.56],
    ["-500", -500],
    ["+200", 200],
    ["1,5", 1.5],
    ["(300)", -300],
    ["2 000 ₽", 2000],
    ["1,234.56", 1234.56],
    ["120000", 120000]
  ])("разбирает %s -> %d", (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });

  it("возвращает null для мусора", () => {
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("12.07.2026")).toBeNull();
  });
});

describe("parseFlexibleDate", () => {
  it.each([
    ["15.07.2026", "2026-07-15"],
    ["15/07/2026", "2026-07-15"],
    ["2026-07-15", "2026-07-15"],
    ["15.07.2026 12:30", "2026-07-15"]
  ])("разбирает %s -> %s", (raw, expected) => {
    expect(parseFlexibleDate(raw)).toBe(expected);
  });

  it("возвращает null для мусора и нереальных дат", () => {
    expect(parseFlexibleDate("июль")).toBeNull();
    expect(parseFlexibleDate("40.13.2026")).toBeNull();
  });
});

describe("guessColumns", () => {
  it("находит колонки по заголовку", () => {
    const rows = parseCsv("Дата операции;Описание;Сумма\n15.07.2026;Магнит;-500");
    expect(guessColumns(rows)).toEqual({ date: 0, description: 1, amount: 2, hasHeader: true });
  });

  it("находит колонки по содержимому без заголовка", () => {
    const rows = parseCsv("15.07.2026;-500;Пятёрочка Москва\n16.07.2026;1200;Перевод от Ивана");
    const mapping = guessColumns(rows);
    expect(mapping.hasHeader).toBe(false);
    expect(mapping.date).toBe(0);
    expect(mapping.amount).toBe(1);
    expect(mapping.description).toBe(2);
  });
});

describe("buildImportRows", () => {
  const categories: Category[] = [
    { id: "food", name: "Продукты", type: "expense", color: "#000" },
    { id: "salary", name: "Зарплата", type: "income", color: "#000" }
  ];

  it("собирает операции: тип по знаку, автокатегория по описанию", () => {
    const rows = parseCsv(
      "Дата;Сумма;Описание\n15.07.2026;-500;Продукты Пятёрочка\n16.07.2026;120000;Зарплата за июнь\n17.07.2026;-99;Неизвестное место"
    );
    const { rows: built, skipped } = buildImportRows(rows, guessColumns(rows), categories);
    expect(skipped).toBe(0);
    expect(built).toHaveLength(3);
    expect(built[0]).toMatchObject({ type: "expense", amount: 500, categoryId: "food" });
    expect(built[1]).toMatchObject({ type: "income", amount: 120000, categoryId: "salary" });
    expect(built[2].categoryId).toBeNull();
  });

  it("даёт детерминированные ключи и различает одинаковые строки", () => {
    const rows = parseCsv("15.07.2026;-100;Кофе\n15.07.2026;-100;Кофе");
    const first = buildImportRows(rows, guessColumns(rows), []);
    const second = buildImportRows(rows, guessColumns(rows), []);
    expect(first.rows[0].key).toBe(second.rows[0].key); // повторный импорт -> те же id
    expect(first.rows[0].key).not.toBe(first.rows[1].key); // но две покупки в день различимы
  });

  it("считает нераспознанные строки", () => {
    const rows = parseCsv("Дата;Сумма;Описание\nмусор;не число;что-то");
    const { rows: built, skipped } = buildImportRows(rows, { date: 0, amount: 1, description: 2, hasHeader: true }, []);
    expect(built).toHaveLength(0);
    expect(skipped).toBe(1);
  });
});

describe("buildOperationsCsv", () => {
  const categories: Category[] = [{ id: "food", name: "Продукты", type: "expense", color: "#000" }];
  const accounts: Account[] = [
    { id: "card", name: "Карта", type: "card", balance: 0 },
    { id: "cash", name: "Наличные", type: "cash", balance: 0 }
  ];

  function operation(overrides: Partial<Operation>): Operation {
    return {
      id: "op",
      date: "2026-07-20",
      type: "expense",
      status: "actual",
      categoryId: "food",
      accountId: "card",
      amount: 500,
      description: "",
      ...overrides
    };
  }

  it("выгружает шапку и строки, расход со знаком минус, кавычки экранируются", () => {
    const csv = buildOperationsCsv(
      [operation({ id: "e1", description: 'Кафе "У дома"; ул. Мира' })],
      categories,
      accounts
    );
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("Дата;Тип;Статус;Категория;Счёт;Сумма;Комментарий");
    expect(lines[1]).toBe('2026-07-20;Расход;Факт;Продукты;Карта;-500;"Кафе ""У дома""; ул. Мира"');
  });

  it("перевод — одной строкой с маршрутом счётов", () => {
    const legs: Operation[] = [
      operation({
        id: "t:out",
        type: "transfer",
        categoryId: null,
        accountId: "card",
        sourceAccountId: "card",
        targetAccountId: "cash",
        amount: 300,
        transferId: "t"
      }),
      operation({
        id: "t:in",
        type: "transfer",
        categoryId: null,
        accountId: "cash",
        sourceAccountId: "card",
        targetAccountId: "cash",
        amount: 300,
        transferId: "t"
      })
    ];
    const csv = buildOperationsCsv(legs, categories, accounts);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2); // шапка + одна строка (нога :in не дублируется)
    expect(lines[1]).toContain("Перевод");
    expect(lines[1]).toContain("Карта → Наличные");
  });

  it("сортирует по дате по возрастанию", () => {
    const csv = buildOperationsCsv(
      [operation({ id: "b", date: "2026-07-22" }), operation({ id: "a", date: "2026-07-20" })],
      categories,
      accounts
    );
    const lines = csv.trim().split("\n");
    expect(lines[1]).toContain("2026-07-20");
    expect(lines[2]).toContain("2026-07-22");
  });
});
