// Пакетная вставка одним многострочным INSERT.
// Построчная вставка в цикле (регенерация регулярных правил, импорт выписки)
// делает по одному запросу на строку: на годовом горизонте это тысячи запросов,
// и прерывание посередине оставляет половину данных записанной. Один INSERT —
// одна неявная транзакция SQLite: либо записываются все строки пакета, либо
// ни одна.

export interface BatchStatement {
  sql: string;
  params: unknown[];
}

// SQLite ограничивает число параметров в запросе (по умолчанию 999),
// поэтому строки разбиваются на пакеты по этому лимиту.
export const MAX_PARAMS = 900;

// prefix — начало запроса до VALUES, например
// "INSERT OR IGNORE INTO operations (id, date, amount)".
// rows — строки с одинаковым числом значений.
export function buildInsertBatches(
  prefix: string,
  rows: unknown[][],
  maxParams = MAX_PARAMS
): BatchStatement[] {
  if (rows.length === 0) return [];

  const columns = rows[0].length;
  if (columns === 0) return [];
  if (rows.some((row) => row.length !== columns)) {
    throw new Error("Все строки пакета должны иметь одинаковое число значений.");
  }

  const rowsPerBatch = Math.max(1, Math.floor(maxParams / columns));
  const statements: BatchStatement[] = [];

  for (let start = 0; start < rows.length; start += rowsPerBatch) {
    const chunk = rows.slice(start, start + rowsPerBatch);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    statements.push({ sql: `${prefix} VALUES ${tuples.join(", ")}`, params });
  }

  return statements;
}
