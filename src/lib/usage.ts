// Что ссылается на статью или счёт — чтобы не удалить используемые.
// Регулярные правила считаем отдельно: удаление статьи с правилом оставило бы
// правило-«сироту», которое генерирует операции с несуществующей статьёй.
export interface Usage {
  operations: number;
  rules: number;
}

// «в 1 операции», «в 3 операциях»; «в 1 правиле», «в 2 правилах».
function inCount(count: number, one: string, many: string): string {
  const singular = count % 10 === 1 && count % 100 !== 11;
  return `${count} ${singular ? one : many}`;
}

export function deleteBlockedMessage(subject: "Статья" | "Счёт", usage: Usage): string | null {
  const parts: string[] = [];
  if (usage.operations > 0) parts.push(inCount(usage.operations, "операции", "операциях"));
  if (usage.rules > 0) {
    parts.push(inCount(usage.rules, "регулярном правиле", "регулярных правилах"));
  }
  if (parts.length === 0) return null;
  return `${subject} используется в ${parts.join(" и ")} — удаление недоступно.`;
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
