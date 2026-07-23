import type { Account, Category, Operation } from "../types";

// --- Декодирование файла: utf-8, при мусоре пробуем windows-1251 (банки её любят).
export function decodeCsvBuffer(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  const replacements = (utf8.match(/�/g) ?? []).length;
  if (replacements === 0) return utf8;
  try {
    return new TextDecoder("windows-1251").decode(buffer);
  } catch {
    return utf8;
  }
}

// --- Разделитель: считаем кандидатов в первых строках.
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const candidates = [";", ",", "\t"];
  let best = ";";
  let bestCount = 0;
  for (const delimiter of candidates) {
    const count = sample.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

// --- CSV-парсер с поддержкой полей в кавычках ("...;..." и "" как экранирование).
export function parseCsv(text: string, delimiter?: string): string[][] {
  const delim = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field.trim());
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some((cell) => cell !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      pushField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      pushRow();
    } else {
      field += ch;
    }
  }
  pushRow();
  return rows;
}

// --- Сумма: пробелы/nbsp как разряды, запятая как десятичная, минус и (скобки).
export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (s === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[\s  ]/g, "").replace(/₽|руб\.?|rub/gi, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  // и запятая, и точка: последняя из них — десятичный разделитель
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = s.replace(",", ".");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

// --- Дата: dd.mm.yyyy / dd/mm/yyyy / yyyy-mm-dd -> ISO.
export function parseFlexibleDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) {
    const alt = /^(\d{2})[./](\d{2})[./](\d{4})/.exec(s);
    if (!alt) return null;
    m = [alt[0], alt[3], alt[2], alt[1]] as unknown as RegExpExecArray;
  }
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export interface ColumnMapping {
  date: number;
  amount: number;
  description: number;
  hasHeader: boolean;
}

const DATE_HEADERS = ["дата", "date", "день"];
const AMOUNT_HEADERS = ["сумма", "amount", "сумма операции", "сумма в валюте счета"];
const DESCRIPTION_HEADERS = ["описание", "description", "назначение", "категория", "комментарий"];

function headerIndex(header: string[], keywords: string[]): number {
  return header.findIndex((cell) =>
    keywords.some((keyword) => cell.trim().toLowerCase().includes(keyword))
  );
}

// --- Угадывание колонок: сначала по заголовку, потом по содержимому.
export function guessColumns(rows: string[][]): ColumnMapping {
  const fallback: ColumnMapping = { date: 0, amount: 1, description: 2, hasHeader: false };
  if (rows.length === 0) return fallback;

  const header = rows[0];
  const hasHeader =
    parseFlexibleDate(header[0] ?? "") === null &&
    header.every((cell) => parseAmount(cell) === null);

  let date = hasHeader ? headerIndex(header, DATE_HEADERS) : -1;
  let amount = hasHeader ? headerIndex(header, AMOUNT_HEADERS) : -1;
  let description = hasHeader ? headerIndex(header, DESCRIPTION_HEADERS) : -1;

  const dataRows = rows.slice(hasHeader ? 1 : 0, hasHeader ? 6 : 5);
  const columnCount = Math.max(...rows.map((row) => row.length));

  if (date < 0) {
    for (let c = 0; c < columnCount; c += 1) {
      if (dataRows.every((row) => parseFlexibleDate(row[c] ?? "") !== null) && dataRows.length > 0) {
        date = c;
        break;
      }
    }
  }
  if (amount < 0) {
    for (let c = 0; c < columnCount; c += 1) {
      if (c === date) continue;
      if (
        dataRows.length > 0 &&
        dataRows.every(
          (row) => parseAmount(row[c] ?? "") !== null && parseFlexibleDate(row[c] ?? "") === null
        )
      ) {
        amount = c;
        break;
      }
    }
  }
  if (description < 0) {
    let bestLen = -1;
    for (let c = 0; c < columnCount; c += 1) {
      if (c === date || c === amount) continue;
      const avg =
        dataRows.reduce((sum, row) => sum + (row[c] ?? "").length, 0) / (dataRows.length || 1);
      if (avg > bestLen) {
        bestLen = avg;
        description = c;
      }
    }
  }

  return {
    date: date >= 0 ? date : fallback.date,
    amount: amount >= 0 ? amount : fallback.amount,
    description: description >= 0 ? description : fallback.description,
    hasHeader
  };
}

// --- Автокатегория: подстрочное совпадение названия статьи в описании.
export function autoCategoryId(
  description: string,
  type: "income" | "expense",
  categories: Category[]
): string | null {
  const lower = description.toLowerCase();
  const match = categories.find(
    (category) => category.type === type && lower.includes(category.name.toLowerCase())
  );
  return match?.id ?? null;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

export interface ImportRow {
  key: string; // детерминированный id операции — повторный импорт не создаёт дублей
  date: string;
  amount: number; // абсолютное значение
  type: "income" | "expense";
  categoryId: string | null;
  description: string;
}

export interface ImportBuildResult {
  rows: ImportRow[];
  skipped: number; // строки, где не разобрались дата или сумма
}

// --- Сборка операций-кандидатов из размеченных колонок.
export function buildImportRows(
  rows: string[][],
  mapping: ColumnMapping,
  categories: Category[]
): ImportBuildResult {
  const result: ImportRow[] = [];
  const keyCounts = new Map<string, number>();
  let skipped = 0;

  const dataRows = mapping.hasHeader ? rows.slice(1) : rows;
  for (const row of dataRows) {
    const date = parseFlexibleDate(row[mapping.date] ?? "");
    const signed = parseAmount(row[mapping.amount] ?? "");
    if (!date || signed === null || signed === 0) {
      skipped += 1;
      continue;
    }
    const description = (row[mapping.description] ?? "").trim();
    const type: "income" | "expense" = signed > 0 ? "income" : "expense";
    const base = `import:${date}:${Math.abs(signed)}:${hashString(description)}`;
    const seen = keyCounts.get(base) ?? 0;
    keyCounts.set(base, seen + 1);
    result.push({
      key: seen === 0 ? base : `${base}:${seen}`,
      date,
      amount: Math.abs(signed),
      type,
      categoryId: autoCategoryId(description, type, categories),
      description
    });
  }

  return { rows: result, skipped };
}

// --- Экспорт журнала операций в CSV (разделитель «;», для Excel).
// Переводы выгружаются одной строкой (нога списания) с маршрутом «A → B».
const TYPE_LABELS: Record<Operation["type"], string> = {
  income: "Доход",
  expense: "Расход",
  transfer: "Перевод"
};

function csvField(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildOperationsCsv(
  operations: Operation[],
  categories: Category[],
  accounts: Account[]
): string {
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));
  const accountById = new Map(accounts.map((account) => [account.id, account.name]));

  const rows = operations
    .filter((op) => op.type !== "transfer" || op.accountId === op.sourceAccountId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((op) => {
      const category =
        op.type === "transfer" ? "Перевод" : (op.categoryId && categoryById.get(op.categoryId)) || "";
      const account =
        op.type === "transfer"
          ? `${accountById.get(op.sourceAccountId ?? "") ?? "—"} → ${
              accountById.get(op.targetAccountId ?? "") ?? "—"
            }`
          : accountById.get(op.accountId) ?? "";
      const signed = op.type === "expense" ? -op.amount : op.amount;
      return [
        op.date,
        TYPE_LABELS[op.type],
        op.status === "planned" ? "План" : "Факт",
        category,
        account,
        String(signed),
        op.description
      ]
        .map(csvField)
        .join(";");
    });

  // BOM — чтобы Excel открыл кириллицу в UTF-8 без танцев.
  return `﻿Дата;Тип;Статус;Категория;Счёт;Сумма;Комментарий\n${rows.join("\n")}\n`;
}
