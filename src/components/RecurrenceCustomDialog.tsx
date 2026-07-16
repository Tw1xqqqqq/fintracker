import { useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { IntervalUnit } from "../types";

export type CustomRecurrence = {
  count: number;
  unit: IntervalUnit;
  weekdays: number[]; // 1 (пн) … 7 (вс), для unit = week
  monthlyMode: "date" | "weekday"; // для unit = month
  endMode: "never" | "date" | "count";
  endDate: string;
  repeatCount: number;
};

const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const WEEKDAY_ACC = [
  "понедельник",
  "вторник",
  "среду",
  "четверг",
  "пятницу",
  "субботу",
  "воскресенье"
];
const ORDINALS = ["перв.", "втор.", "трет.", "четв.", "пят."];

const UNIT_OPTIONS: { value: IntervalUnit; label: string }[] = [
  { value: "day", label: "Дней" },
  { value: "week", label: "Недель" },
  { value: "month", label: "Месяцев" },
  { value: "year", label: "Год" }
];

function isoWeekdayOf(iso: string): number {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function monthLabels(startDate: string) {
  const date = new Date(`${startDate}T00:00:00Z`);
  const dayOfMonth = date.getUTCDate();
  const ordinal = ORDINALS[Math.min(Math.ceil(dayOfMonth / 7), 5) - 1];
  const weekday = WEEKDAY_ACC[isoWeekdayOf(startDate) - 1];
  return {
    date: `Ежемесячно — ${dayOfMonth}-го числа`,
    weekday: `Ежемесячно ${ordinal} ${weekday}`
  };
}

// Короткая подпись выбранной настройки для триггера в поповере.
export function customRecurrenceLabel(config: CustomRecurrence, startDate: string): string {
  const { count, unit } = config;
  if (unit === "day") return count === 1 ? "Ежедневно" : `Каждые ${count} дн.`;
  if (unit === "week") {
    const days =
      config.weekdays.length > 0
        ? config.weekdays.map((d) => WEEKDAY_SHORT[d - 1]).join(", ")
        : WEEKDAY_SHORT[isoWeekdayOf(startDate) - 1];
    return `${count === 1 ? "Еженедельно" : `Каждые ${count} нед.`} (${days})`;
  }
  if (unit === "month") {
    const labels = monthLabels(startDate);
    const base = count === 1 ? "Ежемесячно" : `Каждые ${count} мес.`;
    const suffix =
      config.monthlyMode === "weekday"
        ? labels.weekday.replace("Ежемесячно ", "")
        : `${new Date(`${startDate}T00:00:00Z`).getUTCDate()}-го числа`;
    return `${base} — ${suffix}`;
  }
  return count === 1 ? "Ежегодно" : `Каждые ${count} г.`;
}

export function defaultCustomRecurrence(startDate: string, endDate: string): CustomRecurrence {
  return {
    count: 1,
    unit: "week",
    weekdays: [isoWeekdayOf(startDate)],
    monthlyMode: "date",
    endMode: "never",
    endDate,
    repeatCount: 11
  };
}

type RecurrenceCustomDialogProps = {
  startDate: string;
  initial: CustomRecurrence;
  onCancel: () => void;
  onSubmit: (config: CustomRecurrence) => void;
};

export function RecurrenceCustomDialog({
  startDate,
  initial,
  onCancel,
  onSubmit
}: RecurrenceCustomDialogProps) {
  const [count, setCount] = useState(initial.count);
  const [unit, setUnit] = useState<IntervalUnit>(initial.unit);
  const [weekdays, setWeekdays] = useState<number[]>(
    initial.weekdays.length > 0 ? initial.weekdays : [isoWeekdayOf(startDate)]
  );
  const [monthlyMode, setMonthlyMode] = useState<"date" | "weekday">(initial.monthlyMode);
  const [endMode, setEndMode] = useState(initial.endMode);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [repeatCount, setRepeatCount] = useState(initial.repeatCount);

  const labels = monthLabels(startDate);

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) => {
      if (prev.includes(day)) {
        // хотя бы один день должен остаться выбранным
        return prev.length > 1 ? prev.filter((d) => d !== day) : prev;
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  };

  const isValid =
    count >= 1 &&
    (unit !== "week" || weekdays.length > 0) &&
    (endMode !== "date" || endDate >= startDate) &&
    (endMode !== "count" || repeatCount >= 1);

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit({ count, unit, weekdays, monthlyMode, endMode, endDate, repeatCount });
  };

  return (
    <div className="modal-overlay recur-overlay" onClick={onCancel}>
      <div
        className="recur-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recur-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="recur-dialog-header">
          <h2 id="recur-dialog-title">Пользовательская настройка</h2>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Закрыть">
            <X size={14} />
          </button>
        </header>

        <div className="recur-dialog-body">
          <div className="recur-interval-row">
            <span>Повторять с интервалом</span>
            <span className="recur-stepper">
              <input
                type="number"
                min="1"
                aria-label="Интервал"
                value={count}
                onChange={(event) => setCount(Math.max(1, Number(event.target.value) || 1))}
              />
              <span className="recur-stepper-buttons" aria-hidden="true">
                <button type="button" tabIndex={-1} onClick={() => setCount((v) => v + 1)}>
                  <ChevronUp size={12} />
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setCount((v) => Math.max(1, v - 1))}
                >
                  <ChevronDown size={12} />
                </button>
              </span>
            </span>
            <select
              aria-label="Единица интервала"
              value={unit}
              onChange={(event) => setUnit(event.target.value as IntervalUnit)}
            >
              {UNIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {unit === "week" && (
            <div className="recur-weekdays">
              <span className="recur-section-label">Дни повторения</span>
              <div className="recur-weekday-chips">
                {WEEKDAY_SHORT.map((label, index) => {
                  const day = index + 1;
                  const active = weekdays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      className={active ? "recur-chip recur-chip--active" : "recur-chip"}
                      aria-pressed={active}
                      onClick={() => toggleWeekday(day)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {unit === "month" && (
            <select
              className="recur-monthly-select"
              aria-label="Вариант ежемесячного повторения"
              value={monthlyMode}
              onChange={(event) => setMonthlyMode(event.target.value as "date" | "weekday")}
            >
              <option value="date">{labels.date}</option>
              <option value="weekday">{labels.weekday}</option>
            </select>
          )}

          <fieldset className="recur-end">
            <legend className="recur-section-label">Окончание</legend>
            <label className="recur-end-option">
              <input
                type="radio"
                name="recur-end"
                checked={endMode === "never"}
                onChange={() => setEndMode("never")}
              />
              <span>Никогда</span>
            </label>
            <label className="recur-end-option">
              <input
                type="radio"
                name="recur-end"
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
            <label className="recur-end-option">
              <input
                type="radio"
                name="recur-end"
                checked={endMode === "count"}
                onChange={() => setEndMode("count")}
              />
              <span>После</span>
              <span className="recur-stepper">
                <input
                  type="number"
                  min="1"
                  aria-label="Количество повторов"
                  value={repeatCount}
                  disabled={endMode !== "count"}
                  onChange={(event) =>
                    setRepeatCount(Math.max(1, Number(event.target.value) || 1))
                  }
                />
                <span className="recur-stepper-buttons" aria-hidden="true">
                  <button
                    type="button"
                    tabIndex={-1}
                    disabled={endMode !== "count"}
                    onClick={() => setRepeatCount((v) => v + 1)}
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    disabled={endMode !== "count"}
                    onClick={() => setRepeatCount((v) => Math.max(1, v - 1))}
                  >
                    <ChevronDown size={12} />
                  </button>
                </span>
              </span>
              <span className="recur-end-suffix">Повторов</span>
            </label>
          </fieldset>
        </div>

        <div className="recur-dialog-actions">
          <button type="button" className="intro-secondary" onClick={onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className="intro-submit"
            disabled={!isValid}
            onClick={handleSubmit}
          >
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
}
