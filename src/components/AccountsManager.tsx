import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Account, Operation } from "../types";
import { computeAccountBalances, formatMoney } from "../lib/finance";
import {
  countOperationsForAccount,
  deleteAccount,
  listAccounts,
  listOperations,
  upsertAccount
} from "../lib/repository";
import { AccountForm } from "./AccountForm";

const TYPE_LABELS: Record<Account["type"], string> = {
  cash: "Наличные",
  card: "Карта",
  savings: "Накопления",
  credit: "Кредит"
};

type AccountsManagerProps = {
  filterType?: Account["type"];
  title?: string;
  description?: string;
};

export function AccountsManager({ filterType, title, description }: AccountsManagerProps = {}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const visibleAccounts = filterType
    ? accounts.filter((account) => account.type === filterType)
    : accounts;

  // Текущий остаток каждого счёта: стартовый баланс + фактические операции.
  const currentBalances = useMemo(
    () => new Map(computeAccountBalances(accounts, operations).map((b) => [b.account.id, b.balance])),
    [accounts, operations]
  );

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [accs, ops] = await Promise.all([listAccounts(), listOperations()]);
      setAccounts(accs);
      setOperations(ops);
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
          <h2 className="panel-title">{title ?? "Счета"}</h2>
          <p className="panel-lead">
            {description ?? "Наличные, карты, накопления и кредитные счета."}
          </p>
        </div>
        {!error && (
          <button type="button" className="intro-submit" onClick={openNew}>
            <Plus size={16} />
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
      ) : visibleAccounts.length === 0 ? (
        <p className="cat-empty">В этом разделе пока нет счетов.</p>
      ) : (
        <ul className="acc-list">
          {visibleAccounts.map((account) => {
            const current = currentBalances.get(account.id) ?? account.balance;
            const changed = current !== account.balance;
            return (
              <li key={account.id}>
                <button type="button" className="acc-item" onClick={() => openEdit(account)}>
                  <span className="acc-info">
                    <span className="acc-name">{account.name}</span>
                    <span className="acc-type">{TYPE_LABELS[account.type]}</span>
                  </span>
                  <span className="acc-balance-wrap">
                    <span className={current < 0 ? "acc-balance acc-balance--neg" : "acc-balance"}>
                      {formatMoney(current)}
                    </span>
                    {changed && (
                      <span className="acc-balance-sub">старт {formatMoney(account.balance)}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {formOpen && (
        <AccountForm
          initial={editing}
          defaultType={filterType}
          error={formError}
          onSave={handleSave}
          onDelete={handleDelete}
          onCancel={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
