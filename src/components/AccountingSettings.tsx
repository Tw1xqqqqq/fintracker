import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import type { Account } from "../types";
import { getSetting, listAccounts, setSetting } from "../lib/repository";

function formatDate(iso: string) {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(parsed);
}

type AccountingSettingsProps = {
  onChanged: () => void;
};

export function AccountingSettings({ onChanged }: AccountingSettingsProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [startDate, setStartDate] = useState("");
  const [primaryId, setPrimaryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const [draftPrimary, setDraftPrimary] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const accs = await listAccounts();
      const savedDate = (await getSetting("startDate")) ?? "";
      const savedPrimary = (await getSetting("primaryAccountId")) ?? accs[0]?.id ?? "";
      setAccounts(accs);
      setStartDate(savedDate);
      setPrimaryId(savedPrimary);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const startEdit = () => {
    setDraftDate(startDate);
    setDraftPrimary(primaryId);
    setEditing(true);
  };

  const handleSave = async () => {
    await setSetting("startDate", draftDate);
    if (draftPrimary) {
      await setSetting("primaryAccountId", draftPrimary);
    }
    setEditing(false);
    await load();
    onChanged();
  };

  const primaryName = accounts.find((account) => account.id === primaryId)?.name ?? "—";

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Параметры учёта</h2>
          <p className="panel-lead">Основной счёт и дата начала учёта.</p>
        </div>
        {!error && !loading && !editing && (
          <button type="button" className="intro-secondary" onClick={startEdit}>
            <Pencil size={16} />
            Изменить
          </button>
        )}
      </div>

      {loading ? (
        <p className="panel-lead">Загрузка…</p>
      ) : error ? (
        <>
          <p className="error-text">{error}</p>
          <p className="panel-lead">
            Настройки доступны только в десктоп-приложении (SQLite). Запустите его через
            <code> npm run tauri dev</code>.
          </p>
        </>
      ) : editing ? (
        <div className="op-form">
          <div className="op-form-grid">
            <label className="field">
              <span>Основной счёт</span>
              <select value={draftPrimary} onChange={(e) => setDraftPrimary(e.target.value)}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Начало учёта</span>
              <input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
            </label>
          </div>
          <p className="panel-lead">Название счёта меняется в разделе «Счета» ниже.</p>
          <div className="modal-actions">
            <span />
            <div className="modal-actions-right">
              <button type="button" className="intro-secondary" onClick={() => setEditing(false)}>
                Отмена
              </button>
              <button type="button" className="intro-submit" onClick={handleSave}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : (
        <dl className="settings-list">
          <div>
            <dt>Основной счёт</dt>
            <dd>{primaryName}</dd>
          </div>
          <div>
            <dt>Начало учёта</dt>
            <dd>{formatDate(startDate)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
