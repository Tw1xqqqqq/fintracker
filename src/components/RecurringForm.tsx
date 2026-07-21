import { FormEvent, useMemo, useState } from "react";
import { ChevronDown, Trash2, X } from "lucide-react";
import type { Account, Category, RecurringRule } from "../types";
import {
  RecurrenceCustomDialog,
  customRecurrenceLabel,
  customRecurrenceToRuleFields,
  defaultCustomRecurrence,
  ruleToCustomRecurrence
} from "./RecurrenceCustomDialog";
import type { CustomRecurrence } from "./RecurrenceCustomDialog";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `rec-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addMonths(iso: string, months: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

type RecurringFormProps = {
  initial: RecurringRule | null;
  categories: Category[];
  accounts: Account[];
  onSave: (rule: RecurringRule) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
};

export function RecurringForm({
  initial,
  categories,
  accounts,
  onSave,
  onDelete,
  onCancel
}: RecurringFormProps) {
  const [type, setType] = useState<RecurringRule["type"]>(initial?.type ?? "expense");
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayIso());
  const [description, setDescription] = useState(initial?.description ?? "");

  // Регулярность — та же CustomRecurrence, что и в поповере операции.
  const [custom, setCustom] = useState<CustomRecurrence>(() => {
    const initialStart = initial?.startDate ?? todayIso();
    const fallbackEnd = addMonths(initialStart, 3);
    return initial
      ? ruleToCustomRecurrence(initial, fallbackEnd)
      : defaultCustomRecurrence(initialStart, fallbackEnd);
  });
  const [recurrenceDialogOpen, setRecurrenceDialogOpen] = useState(false);

  const availableCategories = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type]
  );
  const effectiveCategoryId = availableCategories.some((c) => c.id === categoryId)
    ? categoryId
    : availableCategories[0]?.id ?? "";

  const numericAmount = Number(amount);
  const isValid =
    accountId !== "" && effectiveCategoryId !== "" && numericAmount > 0 && startDate !== "";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid) return;
    onSave({
      id: initial?.id ?? newId(),
      type,
      categoryId: effectiveCategoryId,
      accountId,
      amount: numericAmount,
      startDate,
      description: description.trim(),
      ...customRecurrenceToRuleFields(custom)
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{initial ? "Изменить регулярный платёж" : "Новый регулярный платёж"}</h2>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Закрыть">
            <X size={18} />
          </button>
        </header>

        <form className="op-form" onSubmit={handleSubmit}>
          <div className="op-form-grid">
            <label className="field">
              <span>Тип</span>
              <select value={type} onChange={(e) => setType(e.target.value as RecurringRule["type"])}>
                <option value="income">Доход</option>
                <option value="expense">Расход</option>
              </select>
            </label>
            <label className="field">
              <span>Статья</span>
              <select
                value={effectiveCategoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={availableCategories.length === 0}
              >
                {availableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Счёт</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Сумма</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                required
              />
            </label>
          </div>

          <div className="op-form-grid">
            <label className="field">
              <span>Начало</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Регулярность</span>
              <button
                type="button"
                className="operation-recurrence-trigger"
                onClick={() => setRecurrenceDialogOpen(true)}
              >
                <span>{customRecurrenceLabel(custom, startDate)}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            </label>
          </div>

          <label className="field">
            <span>Комментарий</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Например, Парикмахерская"
            />
          </label>

          <div className="modal-actions">
            {initial ? (
              <button type="button" className="danger-button" onClick={() => onDelete(initial.id)}>
                <Trash2 size={16} />
                Удалить
              </button>
            ) : (
              <span />
            )}
            <div className="modal-actions-right">
              <button type="button" className="intro-secondary" onClick={onCancel}>
                Отмена
              </button>
              <button type="submit" className="intro-submit" disabled={!isValid}>
                Сохранить
              </button>
            </div>
          </div>
        </form>

        {recurrenceDialogOpen && (
          <RecurrenceCustomDialog
            startDate={startDate}
            initial={custom}
            onCancel={() => setRecurrenceDialogOpen(false)}
            onSubmit={(config) => {
              setCustom(config);
              setRecurrenceDialogOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
