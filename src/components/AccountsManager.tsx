import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { Account } from "../types";
import { formatMoney } from "../lib/finance";
import {
  countOperationsForAccount,
  deleteAccount,
  listAccounts,
  upsertAccount
} from "../lib/repository";
import { AccountForm } from "./AccountForm";

const TYPE_LABELS: Record<Account["type"], string> = {
  cash: "Наличные",
  card: "Карта",
  savings: "Накопления",
  credit: "Кредит"
};

export function AccountsManager() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await listAccounts());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const openNew = () => {
    setEditing(null);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (account: Account) => {
    setEditing(account);
    setFormError(null);
    setFormOpen(true);
  };

  const handleSave = async (account: Account) => {
    await upsertAccount(account);
    setFormOpen(false);
    await reload();
  };

  const handleDelete = async (id: string) => {
    const used = await countOperationsForAccount(id);
    if (used > 0) {
      setFormError(`Счёт используется в ${used} операц. — удаление недоступно.`);
      return;
    }
    await deleteAccount(id);
    setFormOpen(false);
    await reload();
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Счета</h2>
          <p className="panel-lead">Наличные, карты, накопления и кредитные счета.</p>
        </div>
        {!error && (
          <button type="button" className="intro-submit" onClick={openNew}>
            <Plus size={18} />
            Добавить счёт
          </button>
        )}
      </div>

      {loading ? (
        <p className="panel-lead">Загрузка счетов…</p>
      ) : error ? (
        <>
          <p className="error-text">{error}</p>
          <p className="panel-lead">
            Справочники доступны только в десктоп-приложении (SQLite). Запустите его через
            <code> npm run tauri dev</code>.
          </p>
        </>
      ) : accounts.length === 0 ? (
        <p className="cat-empty">Пока нет счетов.</p>
      ) : (
        <ul className="acc-list">
          {accounts.map((account) => (
            <li key={account.id}>
              <button type="button" className="acc-item" onClick={() => openEdit(account)}>
                <span className="acc-info">
                  <span className="acc-name">{account.name}</span>
                  <span className="acc-type">{TYPE_LABELS[account.type]}</span>
                </span>
                <span className="acc-balance">{formatMoney(account.balance)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {formOpen && (
        <AccountForm
          initial={editing}
          error={formError}
          onSave={handleSave}
          onDelete={handleDelete}
          onCancel={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
