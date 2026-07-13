import { useEffect, useState } from "react";
import { formatMoney, totalByStatus } from "../lib/finance";
import type { WeeklyBalanceResult } from "../lib/finance";
import { loadWeeklyBalance } from "../lib/weeklyBalance";
import { BalanceChart } from "./BalanceChart";

export function Dashboard() {
  const [data, setData] = useState<WeeklyBalanceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setData(await loadWeeklyBalance());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  if (loading) {
    return <div className="panel panel--empty">Загрузка данных…</div>;
  }

  if (error) {
    return (
      <div className="panel">
        <p className="panel-lead">Не удалось загрузить данные из базы.</p>
        <p className="error-text">{error}</p>
        <p className="panel-lead">
          Дашборд работает только в десктоп-приложении (SQLite). Запустите его через
          <code> npm run tauri dev</code>.
        </p>
      </div>
    );
  }

  if (!data || data.weeks.length === 0) {
    return (
      <div className="panel panel--empty">
        <p className="panel-lead">
          Чтобы построить баланс по неделям, задайте дату начала учёта в разделе «Настройки».
        </p>
      </div>
    );
  }

  const gaps = data.weeks.filter((week) => week.isCashGap).length;

  const incomePlan = totalByStatus(data.operations, "planned", "income");
  const incomeActual = totalByStatus(data.operations, "actual", "income");
  const expensePlan = totalByStatus(data.operations, "planned", "expense");
  const expenseActual = totalByStatus(data.operations, "actual", "expense");

  return (
    <div className="dashboard">
      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-label">Текущий баланс</span>
          <span className="stat-value">{formatMoney(data.initialBalance)}</span>
          <span className="stat-sub">сумма счетов</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Доходы за период</span>
          <span className="stat-value stat-value--income">{formatMoney(incomeActual)}</span>
          <span className="stat-sub">план {formatMoney(incomePlan)}</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Расходы за период</span>
          <span className="stat-value stat-value--expense">{formatMoney(expenseActual)}</span>
          <span className="stat-sub">план {formatMoney(expensePlan)}</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Кассовые разрывы</span>
          <span className={gaps > 0 ? "stat-value stat-value--warn" : "stat-value"}>{gaps}</span>
          <span className="stat-sub">недель в минусе из {data.weeks.length}</span>
        </div>
      </div>

      <BalanceChart weeks={data.weeks} />
    </div>
  );
}
