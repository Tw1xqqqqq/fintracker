import { useEffect, useMemo, useState } from "react";
import { generateWeeks } from "../lib/finance";
import { getSetting, regenerateRecurringOperations, setSetting } from "../lib/repository";
import { PlanTable } from "./PlanTable";

function formatDate(iso: string) {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(parsed);
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2];

export function Plan() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const start = (await getSetting("startDate")) ?? "";
      const end = (await getSetting("endDate")) ?? (start ? `${start.slice(0, 4)}-12-31` : "");
      setStartDate(start);
      setEndDate(end);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const weeks = useMemo(
    () => (startDate ? generateWeeks(startDate, endDate || undefined) : []),
    [startDate, endDate]
  );

  const valid = startDate !== "" && endDate !== "" && startDate <= endDate;

  const pickYear = (year: number) => {
    setStartDate(`${year}-01-01`);
    setEndDate(`${year}-12-31`);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await setSetting("startDate", startDate);
      await setSetting("endDate", endDate);
      // горизонт изменился — пересобрать регулярные операции под новый диапазон
      await regenerateRecurringOperations();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="panel panel--empty">Загрузка…</div>;
  }

  if (error) {
    return (
      <div className="panel">
        <p className="panel-lead">Не удалось загрузить настройки года.</p>
        <p className="error-text">{error}</p>
        <p className="panel-lead">
          План доступен только в десктоп-приложении (SQLite). Запустите его через
          <code> npm run tauri dev</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="plan-stack">
      <div className="panel">
      <h2 className="panel-title">Финансовый год</h2>
      <p className="panel-lead">
        Задайте период планирования — по нему строятся недели для плана и прогноза баланса.
      </p>

      <div className="fy-years">
        {YEARS.map((year) => (
          <button
            key={year}
            type="button"
            className={
              startDate === `${year}-01-01` && endDate === `${year}-12-31`
                ? "fy-year fy-year--active"
                : "fy-year"
            }
            onClick={() => pickYear(year)}
          >
            {year}
          </button>
        ))}
      </div>

      <div className="op-form-grid">
        <label className="field">
          <span>Начало года</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <label className="field">
          <span>Конец года</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setSaved(false);
            }}
          />
        </label>
      </div>

      {startDate !== "" && endDate !== "" && startDate > endDate && (
        <p className="error-text">Конец года не может быть раньше начала.</p>
      )}

      <div className="fy-summary">
        {valid ? (
          <span>
            Сгенерировано недель: <strong>{weeks.length}</strong> · с{" "}
            <strong>{formatDate(weeks[0]?.start ?? startDate)}</strong> по{" "}
            <strong>{formatDate(weeks[weeks.length - 1]?.end ?? endDate)}</strong>
          </span>
        ) : (
          <span>Выберите год или задайте даты начала и конца.</span>
        )}
      </div>

      <div className="modal-actions">
        <span className="fy-hint">{saved ? "Сохранено" : ""}</span>
        <button type="button" className="intro-submit" disabled={!valid || saving} onClick={handleSave}>
          {saving ? "Сохранение…" : "Сохранить год"}
        </button>
      </div>

      </div>

      {valid && <PlanTable weeks={weeks} />}
    </div>
  );
}
