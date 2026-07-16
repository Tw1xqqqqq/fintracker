import { useEffect, useMemo, useState } from "react";
import { Plus, Repeat } from "lucide-react";
import type { Account, Category, RecurringRule } from "../types";
import { formatMoney } from "../lib/finance";
import {
  deleteRecurringRule,
  listAccounts,
  listCategories,
  listRecurringRules,
  regenerateRecurringOperations,
  upsertRecurringRule
} from "../lib/repository";
import { RecurringForm } from "./RecurringForm";

function intervalLabel(rule: RecurringRule) {
  if (rule.recurrenceKind === "daily") return "ежедневно";
  if (rule.recurrenceKind === "weekly") return "еженедельно";
  if (rule.recurrenceKind === "monthly") return "ежемесячно";
  if (rule.recurrenceKind === "yearly") return "ежегодно";
  if (rule.recurrenceKind === "weekdays") return "по будням";
  const days = rule.intervalDays;
  if (days === 7) return "каждую неделю";
  if (days === 14) return "каждые 2 недели";
  if (days === 365) return "раз в год";
  if (days % 30 === 0 && days >= 30) return `каждые ${days / 30} мес.`;
  return `каждые ${days} дн.`;
}

export function RecurringManager() {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRule | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [rls, cats, accs] = await Promise.all([
        listRecurringRules(),
        listCategories(),
        listAccounts()
      ]);
      setRules(rls);
      setCategories(cats);
      setAccounts(accs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (rule: RecurringRule) => {
    setEditing(rule);
    setFormOpen(true);
  };

  const handleSave = async (rule: RecurringRule) => {
    await upsertRecurringRule(rule);
    await regenerateRecurringOperations();
    setFormOpen(false);
    await reload();
  };

  const handleDelete = async (id: string) => {
    await deleteRecurringRule(id);
    await regenerateRecurringOperations();
    setFormOpen(false);
    await reload();
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Регулярные платежи</h2>
          <p className="panel-lead">
            Повторяющиеся операции — раскладываются в план автоматически.
          </p>
        </div>
        {!error && accounts.length > 0 && categories.length > 0 && (
          <button type="button" className="intro-submit" onClick={openNew}>
            <Plus size={16} />
            Добавить
          </button>
        )}
      </div>

      {loading ? (
        <p className="panel-lead">Загрузка…</p>
      ) : error ? (
        <>
          <p className="error-text">{error}</p>
          <p className="panel-lead">
            Доступно только в десктоп-приложении (SQLite). Запустите его через
            <code> npm run tauri dev</code>.
          </p>
        </>
      ) : accounts.length === 0 || categories.length === 0 ? (
        <p className="cat-empty">Сначала добавьте счёт и статьи выше.</p>
      ) : rules.length === 0 ? (
        <p className="cat-empty">Регулярных платежей пока нет.</p>
      ) : (
        <ul className="rec-list">
          {rules.map((rule) => {
            const category = categoryMap.get(rule.categoryId);
            return (
              <li key={rule.id}>
                <button type="button" className="rec-item" onClick={() => openEdit(rule)}>
                  <span className="rec-icon">
                    <Repeat size={16} />
                  </span>
                  <span className="rec-info">
                    <span className="rec-name">
                      {rule.description || category?.name || "Платёж"}
                    </span>
                    <span className="rec-meta">
                      {category?.name ?? "—"} · {intervalLabel(rule)}
                    </span>
                  </span>
                  <span className={`amount amount--${rule.type}`}>
                    {rule.type === "expense" ? "−" : "+"}
                    {formatMoney(rule.amount)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {formOpen && (
        <RecurringForm
          initial={editing}
          categories={categories}
          accounts={accounts}
          onSave={handleSave}
          onDelete={handleDelete}
          onCancel={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
