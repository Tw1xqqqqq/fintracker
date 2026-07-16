import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import type {
  Account,
  Category,
  Operation,
  OperationStatus,
  RecurrenceKind,
  RecurringRule
} from "../types";
import {
  RecurrenceCustomDialog,
  customRecurrenceLabel,
  defaultCustomRecurrence
} from "./RecurrenceCustomDialog";
import type { CustomRecurrence } from "./RecurrenceCustomDialog";

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(iso: string, months: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

const WEEKDAY_DATIVE = [
  "понедельникам",
  "вторникам",
  "средам",
  "четвергам",
  "пятницам",
  "субботам",
  "воскресеньям"
];
const WEEKDAY_ACC = [
  "понедельник",
  "вторник",
  "среду",
  "четверг",
  "пятницу",
  "субботу",
  "воскресенье"
];
const ORDINALS = ["первый", "второй", "третий", "четвёртый", "пятый"];
const MONTHS_GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря"
];

type RecurrenceValue = "never" | "daily" | "weekly" | "monthly" | "yearly" | "weekdays";
type Recurrence = RecurrenceValue | "custom";

// Подписи пресетов зависят от выбранной даты (день недели, число, месяц).
function recurrenceOptions(dateIso: string): { value: RecurrenceValue; label: string }[] {
  const date = new Date(`${dateIso}T00:00:00Z`);
  const weekdayIdx = (date.getUTCDay() + 6) % 7; // 0 = пн
  const ordinal = ORDINALS[Math.min(Math.ceil(date.getUTCDate() / 7), 5) - 1];
  return [
    { value: "never", label: "Не повторять" },
    { value: "daily", label: "Ежедневно" },
    { value: "weekly", label: `Еженедельно по ${WEEKDAY_DATIVE[weekdayIdx]}` },
    { value: "monthly", label: `Ежемесячно в ${ordinal} ${WEEKDAY_ACC[weekdayIdx]}` },
    { value: "yearly", label: `Ежегодно ${date.getUTCDate()} ${MONTHS_GEN[date.getUTCMonth()]}` },
    { value: "weekdays", label: "Каждый будний день" }
  ];
}

type OperationPopoverProps = {
  accounts: Account[];
  categories: Category[];
  initialCategoryId: string;
  initialDate: string;
  defaultAccountId?: string;
  // Статус создаваемой записи: факт (actual) или план (planned).
  status?: OperationStatus;
  onCancel: () => void;
  // operation = null, когда запись целиком описывается регулярным правилом
  // (плановая с регулярностью — даты сгенерирует само правило).
  onSave: (operation: Operation | null, recurringRule: RecurringRule | null) => Promise<void>;
};

export function OperationPopover({
  accounts,
  categories,
  initialCategoryId,
  initialDate,
  defaultAccountId,
  status = "actual",
  onCancel,
  onSave
}: OperationPopoverProps) {
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [date, setDate] = useState(initialDate || todayIso());
  const [recurrence, setRecurrence] = useState<Recurrence>("never");
  const [recurrenceMenuOpen, setRecurrenceMenuOpen] = useState(false);
  const [custom, setCustom] = useState<CustomRecurrence | null>(null);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [endMode, setEndMode] = useState<"never" | "date" | "count">("date");
  const [endDate, setEndDate] = useState(() => addMonths(initialDate || todayIso(), 3));
  const [repeatCount, setRepeatCount] = useState(11);
  const [accountId, setAccountId] = useState(
    () =>
      accounts.find((account) => account.id === defaultAccountId)?.id ?? accounts[0]?.id ?? ""
  );
  const [saving, setSaving] = useState(false);

  const category = useMemo(
    () => categories.find((item) => item.id === categoryId) ?? categories[0],
    [categories, categoryId]
  );
  const options = useMemo(() => recurrenceOptions(date || todayIso()), [date]);
  const numericAmount = Number(amount);
  const isRecurring = recurrence !== "never";
  // Для custom окончание живёт в диалоге настройки, для пресетов — в поповере.
  const endIsValid =
    !isRecurring ||
    recurrence === "custom" ||
    endMode === "never" ||
    (endMode === "date" ? endDate >= date : repeatCount >= 1);
  const isValid =
    numericAmount > 0 &&
    category !== undefined &&
    accountId !== "" &&
    date !== "" &&
    (recurrence !== "custom" || custom !== null) &&
    endIsValid;
  const recurrenceLabel =
    recurrence === "custom" && custom
      ? customRecurrenceLabel(custom, date)
      : options.find((option) => option.value === recurrence)?.label ?? "Не повторять";

  useEffect(() => {
    if (!categories.some((item) => item.id === categoryId)) {
      setCategoryId(categories[0]?.id ?? "");
    }
  }, [categories, categoryId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid || saving) return;

    setSaving(true);
    try {
      const operation: Operation = {
        id: newId(),
        amount: numericAmount,
        type: category.type,
        status,
        categoryId,
        accountId,
        date,
        description: ""
      };

      let recurringRule: RecurringRule | null = null;
      if (recurrence === "custom" && custom) {
        recurringRule = {
          id: newId(),
          type: category.type,
          categoryId,
          accountId,
          amount: numericAmount,
          recurrenceKind: "interval",
          intervalDays: custom.count,
          intervalUnit: custom.unit,
          weekdays: custom.unit === "week" ? custom.weekdays : null,
          monthlyMode: custom.unit === "month" ? custom.monthlyMode : null,
          startDate: date,
          endDate: custom.endMode === "date" ? custom.endDate : null,
          occurrenceCount: custom.endMode === "count" ? custom.repeatCount : null,
          description: ""
        };
      } else if (isRecurring) {
        const recurrenceKind: RecurrenceKind = recurrence as RecurrenceKind;
        const intervalDays =
          recurrence === "daily" || recurrence === "weekdays"
            ? 1
            : recurrence === "weekly"
              ? 7
              : recurrence === "monthly"
                ? 30
                : 365;
        recurringRule = {
          id: newId(),
          type: category.type,
          categoryId,
          accountId,
          amount: numericAmount,
          recurrenceKind,
          intervalDays,
          startDate: date,
          endDate: endMode === "date" ? endDate : null,
          occurrenceCount: endMode === "count" ? repeatCount : null,
          description: ""
        };
      }

      // Плановая запись с регулярностью: стартовую дату сгенерирует правило,
      // отдельная операция задвоила бы план на эту дату.
      const skipStandaloneOperation = status === "planned" && recurringRule !== null;
      await onSave(skipStandaloneOperation ? null : operation, recurringRule);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form
        className={isRecurring ? "operation-popover operation-popover--recurring" : "operation-popover"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="operation-popover-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <p id="operation-popover-title" className="operation-popover-title">
          {status === "planned" ? "Добавить плановую запись" : "Добавить запись"}
        </p>

        <div className="operation-popover-fields">
          <div className="operation-popover-row operation-popover-row--amount">
            <label htmlFor="operation-amount">Сумма</label>
            <input
              id="operation-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="Введите сумму"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              autoFocus
            />
            <select aria-label="Валюта" defaultValue="RUB">
              <option value="RUB">RUB</option>
            </select>
          </div>

          <div className="operation-popover-row">
            <label htmlFor="operation-category">Категория</label>
            <select
              id="operation-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={categories.length === 0}
            >
              {categories.length === 0 ? (
                <option value="">Нет категорий</option>
              ) : (
                categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="operation-popover-row">
            <label htmlFor="operation-date">Дата операции</label>
            <span className="operation-popover-date">
              <CalendarDays size={16} aria-hidden="true" />
              <input
                id="operation-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </span>
          </div>

          <div className="operation-popover-row">
            <label htmlFor="operation-recurrence">Регулярность</label>
            <span className="operation-recurrence-wrap">
              <button
                id="operation-recurrence"
                type="button"
                className="operation-recurrence-trigger"
                aria-expanded={recurrenceMenuOpen}
                onClick={() => setRecurrenceMenuOpen((open) => !open)}
              >
                <span>{recurrenceLabel}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              {recurrenceMenuOpen && (
                <div className="operation-recurrence-menu" role="listbox" aria-label="Регулярность">
                  {options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="operation-recurrence-menu-item"
                      role="option"
                      aria-selected={recurrence === option.value}
                      onClick={() => {
                        setRecurrence(option.value);
                        setRecurrenceMenuOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="operation-recurrence-menu-item operation-recurrence-menu-item--custom"
                    onClick={() => {
                      setRecurrenceMenuOpen(false);
                      setCustomDialogOpen(true);
                    }}
                  >
                    <span>Пользовательская настройка</span>
                    <ChevronRight size={20} aria-hidden="true" />
                  </button>
                </div>
              )}
            </span>
          </div>

          {isRecurring && recurrence !== "custom" && (
            <fieldset className="operation-end-settings">
              <legend>Окончание</legend>
              <label className="operation-end-option operation-end-option--never">
                <input
                  type="radio"
                  name="operation-end"
                  checked={endMode === "never"}
                  onChange={() => setEndMode("never")}
                />
                <span>Никогда</span>
              </label>
              <label className="operation-end-option operation-end-option--date">
                <input
                  type="radio"
                  name="operation-end"
                  checked={endMode === "date"}
                  onChange={() => setEndMode("date")}
                />
                <span>Дата</span>
                <input
                  type="date"
                  aria-label="Дата окончания"
                  value={endDate}
                  disabled={endMode !== "date"}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
              <label className="operation-end-option operation-end-option--count">
                <input
                  type="radio"
                  name="operation-end"
                  checked={endMode === "count"}
                  onChange={() => setEndMode("count")}
                />
                <span>После</span>
                <span className="operation-repeat-count">
                  <input
                    type="number"
                    min="1"
                    aria-label="Количество повторов"
                    value={repeatCount}
                    disabled={endMode !== "count"}
                    onChange={(event) => setRepeatCount(Math.max(1, Number(event.target.value) || 1))}
                  />
                  <span>повторов</span>
                  <span className="operation-repeat-stepper" aria-hidden="true">
                    <ChevronUp size={16} />
                    <ChevronDown size={16} />
                  </span>
                </span>
              </label>
            </fieldset>
          )}
        </div>

        <div className="operation-popover-actions">
          <button type="button" className="operation-popover-cancel" onClick={onCancel}>
            Отмена
          </button>
          <button type="submit" className="operation-popover-submit" disabled={!isValid || saving}>
            Добавить
          </button>
        </div>

        {customDialogOpen && (
          <RecurrenceCustomDialog
            startDate={date || todayIso()}
            initial={custom ?? defaultCustomRecurrence(date || todayIso(), endDate)}
            onCancel={() => setCustomDialogOpen(false)}
            onSubmit={(config) => {
              setCustom(config);
              setRecurrence("custom");
              setCustomDialogOpen(false);
            }}
          />
        )}
      </form>
    </div>
  );
}
