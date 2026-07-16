import { useEffect, useState } from "react";
import type { Account, Operation, Reconciliation } from "../types";
import { computeExpectedBalance, formatMoney } from "../lib/finance";
import {
  ensureAdjustmentCategory,
  getSetting,
  listAccounts,
  listOperations,
  listReconciliations,
  saveReconciliation,
  upsertOperation
} from "../lib/repository";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `recon-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(parsed);
}

export function BalanceReconciliation() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [history, setHistory] = useState<Reconciliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actualInput, setActualInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [accs, ops, recs] = await Promise.all([
        listAccounts(),
        listOperations(),
        listReconciliations()
      ]);
      setAccounts(accs);
      setOperations(ops);
      setHistory(recs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const today = todayIso();
  const expected = computeExpectedBalance(accounts, operations, today);

  const actual = Number(actualInput);
  const hasInput = actualInput.trim() !== "" && Number.isFinite(actual);
  const diff = hasInput ? actual - expected : 0;

  // Записывает сверку; при withCorrection создаёт корректирующую операцию,
  // чтобы расчётный остаток сравнялся с фактическим.
  const handleConfirm = async (withCorrection: boolean) => {
    if (!hasInput) return;
    setSaving(true);
    setError(null);
    try {
      let operationId: string | null = null;

      if (withCorrection && diff !== 0) {
        const type = diff > 0 ? "income" : "expense";
        const categoryId = await ensureAdjustmentCategory(type);
        const primaryId = await getSetting("primaryAccountId");
        const account = accounts.find((a) => a.id === primaryId) ?? accounts[0];
        operationId = newId();
        await upsertOperation({
          id: operationId,
          date: today,
          type,
          status: "actual",
          categoryId,
          accountId: account.id,
          amount: Math.abs(diff),
          description: "Корректировка по сверке баланса"
        });
      }

      await saveReconciliation({
        id: newId(),
        date: today,
        expected,
        actual,
        diff,
        operationId,
        createdAt: new Date().toISOString()
      });

      setActualInput("");
      setSaved(true);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="panel panel--empty">Загрузка…</div>;
  }

  if (error && accounts.length === 0) {
    return (
      <div className="panel">
        <p className="panel-lead">Не удалось загрузить данные для сверки.</p>
        <p className="error-text">{error}</p>
        <p className="panel-lead">
          Сверка доступна только в десктоп-приложении (SQLite). Запустите его через
          <code> npm run tauri dev</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="recon-stack">
      <div className="panel">
        <h2 className="panel-title">Сверка баланса</h2>
        <p className="panel-lead">
          Сравните расчётный остаток на {formatDate(today)} с фактическим — по выписке или
          наличным.
        </p>

        <dl className="settings-list">
          <div>
            <dt>Расчётный остаток</dt>
            <dd>{formatMoney(expected)}</dd>
          </div>
        </dl>

        <div className="op-form-grid">
          <label className="field">
            <span>Фактический остаток</span>
            <input
              type="number"
              step="0.01"
              value={actualInput}
              placeholder="0"
              onChange={(event) => {
                setActualInput(event.target.value);
                setSaved(false);
              }}
            />
          </label>

          <div className="field">
            <span>Расхождение</span>
            <div
              className={
                !hasInput || diff === 0
                  ? "recon-diff"
                  : diff > 0
                    ? "recon-diff recon-diff--income"
                    : "recon-diff recon-diff--expense"
              }
            >
              {hasInput ? `${diff > 0 ? "+" : ""}${formatMoney(diff)}` : "—"}
            </div>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <span className="fy-hint">{saved ? "Баланс подтверждён" : ""}</span>
          <div className="modal-actions-right">
            {hasInput && diff !== 0 && (
              <button
                type="button"
                className="intro-secondary"
                disabled={saving}
                onClick={() => handleConfirm(false)}
              >
                Записать без корректировки
              </button>
            )}
            <button
              type="button"
              className="intro-submit"
              disabled={!hasInput || saving}
              onClick={() => handleConfirm(diff !== 0)}
            >
              {saving
                ? "Сохранение…"
                : diff !== 0 && hasInput
                  ? "Создать корректирующую операцию"
                  : "Подтвердить баланс"}
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">История сверок</h2>
        {history.length === 0 ? (
          <p className="cat-empty">Сверок пока не было.</p>
        ) : (
          <ul className="recon-list">
            {history.map((rec) => (
              <li key={rec.id} className="recon-item">
                <span className="recon-item-date">{formatDate(rec.date)}</span>
                <span className="recon-item-values">
                  расчёт {formatMoney(rec.expected)} · факт {formatMoney(rec.actual)}
                </span>
                <span
                  className={
                    rec.diff === 0
                      ? "amount"
                      : rec.diff > 0
                        ? "amount amount--income"
                        : "amount amount--expense"
                  }
                >
                  {rec.diff > 0 ? "+" : ""}
                  {formatMoney(rec.diff)}
                </span>
                {rec.operationId && <span className="status-badge status-badge--actual">корректировка</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
