// Даты в приложении — строки ISO yyyy-mm-dd без времени.
// «Сегодня» берём по локальному календарю пользователя: toISOString() даёт
// дату по UTC, и с 00:00 до 03:00 по МСК «сегодня» оказывалось вчерашним днём
// (не та текущая неделя, не та дата по умолчанию у новой операции).

export function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayIso(now: Date = new Date()): string {
  return toLocalIsoDate(now);
}

// «19.10»
export function shortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}.${match[2]}` : iso;
}

// «19 октября 2026 г.». ISO-дата разбирается и форматируется в UTC, чтобы
// день не сдвигался в часовых поясах западнее Гринвича.
export function formatLongDate(iso: string): string {
  if (!iso) return "—";
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(parsed);
}

// prefix — только для запасного варианта без crypto.randomUUID (acc-…, op-…).
export function newId(prefix: string): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
