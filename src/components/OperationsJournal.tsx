import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Briefcase,
  Car,
  ChevronDown,
  ChevronUp,
  Clock,
  Dumbbell,
  EllipsisVertical,
  Film,
  GraduationCap,
  HeartPulse,
  House,
  Plane,
  Plus,
  Repeat,
  Search,
  Shirt,
  Tag,
  TrendingUp,
  Utensils,
  Wallet,
  Wifi
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Account, Category, Operation } from "../types";
import type { Week } from "../lib/finance";
import {
  confirmedOperationId,
  formatMoney,
  generateWeeks,
  pendingRecurringOperations
} from "../lib/finance";
import {
  deleteOperation,
  getSetting,
  listAccounts,
  listCategories,
  listOperations,
  upsertOperation
} from "../lib/repository";
import { OperationForm } from "./OperationForm";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function shortDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}.${match[2]}` : iso;
}

// «23 июля»
function dayLabel(iso: string) {
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC"
  }).format(parsed);
}

function signedMoney(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatMoney(Math.abs(value))}`;
}

// Иконка статьи подбирается по ключевым словам в названии.
const ICON_RULES: { icon: LucideIcon; keywords: string[] }[] = [
  { icon: Wallet, keywords: ["зарплат", "оклад"] },
  { icon: Briefcase, keywords: ["фриланс", "подработ", "работа", "клиент"] },
  { icon: TrendingUp, keywords: ["инвест", "дивиденд", "вклад", "процент"] },
  { icon: Utensils, keywords: ["еда", "продукт", "кафе", "ресторан"] },
  { icon: House, keywords: ["аренд", "жиль", "кварт", "дом", "комму"] },
  { icon: Dumbbell, keywords: ["спорт", "фитнес", "зал"] },
  { icon: HeartPulse, keywords: ["медиц", "аптек", "здоров", "врач"] },
  { icon: Car, keywords: ["транспорт", "такси", "авто", "бензин", "проезд"] },
  { icon: GraduationCap, keywords: ["образован", "курс", "учеб"] },
  { icon: Wifi, keywords: ["подписк", "интернет", "связь", "телефон"] },
  { icon: Shirt, keywords: ["одежд", "обув"] },
  { icon: Plane, keywords: ["путешеств", "отпуск", "поездк", "билет"] },
  { icon: Film, keywords: ["развлеч", "кино", "игр"] }
];

// Мягкая палитра для кружка статьи — стабильно по названию.
const ICON_COLORS = [
  "#059669",
  "#d97706",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#ca8a04",
  "#dc2626"
];

function categoryVisual(name: string): { Icon: LucideIcon; color: string } {
  const lower = name.toLowerCase();
  const rule = ICON_RULES.find((item) => item.keywords.some((word) => lower.includes(word)));
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return { Icon: rule?.icon ?? Tag, color: ICON_COLORS[hash % ICON_COLORS.length] };
}

type PeriodFilter = "week" | "month" | "year" | "all";
type TypeFilter = "all" | Operation["type"];
type StatusFilter = "all" | Operation["status"];

export function OperationsJournal() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodFilter>("week");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(true);

  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Operation | null>(null);

  const [alertDismissed, setAlertDismissed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const today = todayIso();

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [ops, accs, cats, startDate, endDate] = await Promise.all([
        listOperations(),
        listAccounts(),
        listCategories(),
        getSetting("startDate"),
        getSetting("endDate")
      ]);
      setOperations(ops);
      setAccounts(accs);
      setCategories(cats);
      setWeeks(startDate ? generateWeeks(startDate, endDate ?? undefined) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const currentWeekIdx = useMemo(
    () => weeks.findIndex((week) => today >= week.start && today <= week.end),
    [weeks, today]
  );

  // Диапазон дат по выбранному периоду + подпись для шапки.
  const range = useMemo(() => {
    if (period === "week") {
      const week = currentWeekIdx >= 0 ? weeks[currentWeekIdx] : null;
      if (!week) return { from: null, to: null, label: "Все операции" };
      return {
        from: week.start,
        to: week.end,
        label: `Неделя ${currentWeekIdx + 1} · ${shortDate(week.start)}–${shortDate(week.end)}`
      };
    }
    if (period === "month") {
      const from = `${today.slice(0, 7)}-01`;
      const date = new Date(`${from}T00:00:00Z`);
      const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
      const label = new Intl.DateTimeFormat("ru-RU", {
        month: "long",
        year: "numeric",
        timeZone: "UTC"
      }).format(date);
      return { from, to: last.toISOString().slice(0, 10), label };
    }
    if (period === "year") {
      if (weeks.length > 0) {
        const from = weeks[0].start;
        const to = weeks[weeks.length - 1].end;
        return { from, to, label: `Финансовый год · ${shortDate(from)}–${shortDate(to)}` };
      }
      const year = today.slice(0, 4);
      return { from: `${year}-01-01`, to: `${year}-12-31`, label: `${year} год` };
    }
    return { from: null, to: null, label: "Все операции" };
  }, [period, weeks, currentWeekIdx, today]);

  // Одна нога перевода в списке: показываем только сторону списания.
  const visibleOperations = useMemo(
    () => operations.filter((op) => op.type !== "transfer" || op.accountId === op.sourceAccountId),
    [operations]
  );

  const pending = useMemo(() => {
    if (currentWeekIdx < 0) return [];
    const week = weeks[currentWeekIdx];
    return pendingRecurringOperations(operations, week.start, week.end);
  }, [operations, weeks, currentWeekIdx]);

  const pendingIds = useMemo(() => new Set(pending.map((op) => op.id)), [pending]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return visibleOperations.filter((op) => {
      if (range.from && op.date < range.from) return false;
      if (range.to && op.date > range.to) return false;
      if (typeFilter !== "all" && op.type !== typeFilter) return false;
      if (statusFilter !== "all" && op.status !== statusFilter) return false;
      if (accountFilter !== "all" && op.accountId !== accountFilter) return false;
      if (categoryFilter !== "all" && op.categoryId !== categoryFilter) return false;
      if (query) {
        const category = op.categoryId ? categoryMap.get(op.categoryId)?.name ?? "" : "Перевод";
        const account = accountMap.get(op.accountId)?.name ?? "";
        const haystack = `${category} ${op.description} ${account}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [
    visibleOperations,
    range,
    typeFilter,
    statusFilter,
    accountFilter,
    categoryFilter,
    search,
    categoryMap,
    accountMap
  ]);

  // Итоги периода: переводы нейтральны и в доход/расход не попадают.
  const stats = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const op of filtered) {
      if (op.type === "income") income += op.amount;
      else if (op.type === "expense") expense += op.amount;
    }
    return { income, expense, net: income - expense };
  }, [filtered]);

  // Группировка по дню, новые сверху.
  const days = useMemo(() => {
    const map = new Map<string, Operation[]>();
    for (const op of filtered) {
      const list = map.get(op.date) ?? [];
      list.push(op);
      map.set(op.date, list);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({
        date,
        items,
        total: items.reduce(
          (sum, op) =>
            op.type === "income" ? sum + op.amount : op.type === "expense" ? sum - op.amount : sum,
          0
        )
      }));
  }, [filtered]);

  const toggleDay = (date: string) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const confirmPending = async () => {
    if (pending.length === 0 || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      for (const planned of pending) {
        if (!planned.categoryId) continue;
        await upsertOperation({
          id: confirmedOperationId(planned.id),
          date: planned.date,
          type: planned.type,
          status: "actual",
          categoryId: planned.categoryId,
          accountId: planned.accountId,
          amount: planned.amount,
          description: planned.description
        });
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  };

  const handleSave = async (operation: Operation) => {
    await upsertOperation(operation);
    setFormOpen(false);
    await reload();
  };

  const handleDelete = async (id: string) => {
    await deleteOperation(id);
    setFormOpen(false);
    setMenuFor(null);
    await reload();
  };

  if (loading) {
    return <div className="panel panel--empty">Загрузка операций…</div>;
  }

  if (error && operations.length === 0 && accounts.length === 0) {
    return (
      <div className="panel">
        <p className="panel-lead">Не удалось загрузить операции из базы данных.</p>
        <p className="error-text">{error}</p>
        <p className="panel-lead">
          Журнал работает только в десктоп-приложении (SQLite). Запустите его через
          <code> npm run tauri dev</code>.
        </p>
      </div>
    );
  }

  const pendingTotal = pending.reduce((sum, op) => sum + op.amount, 0);
  const pendingNames = pending
    .map((op) => (op.categoryId ? categoryMap.get(op.categoryId)?.name : null))
    .filter((name): name is string => Boolean(name));

  return (
    <div className="ops-page">
      {pending.length > 0 && !alertDismissed && (
        <div className="budget-alert" role="status">
          <span className="budget-alert-icon">
            <Clock size={18} />
          </span>
          <span className="budget-alert-text">
            <span className="budget-alert-title">
              {pending.length}{" "}
              {pending.length === 1
                ? "регулярная операция ожидает подтверждение"
                : "регулярных операций ожидают подтверждения"}
            </span>
            <span className="budget-alert-sub">
              {pendingNames.join(", ")} · {formatMoney(pendingTotal)}
            </span>
          </span>
          <span className="budget-alert-actions">
            <button type="button" className="intro-secondary" onClick={() => setAlertDismissed(true)}>
              Отмена
            </button>
            <button
              type="button"
              className="intro-submit"
              disabled={confirming}
              onClick={() => void confirmPending()}
            >
              {confirming ? "Подтверждение…" : "Подтвердить"}
            </button>
          </span>
        </div>
      )}

      <div className="panel budget-panel">
        <div className="budget-toolbar">
          <div className="budget-toolbar-left">
            <span className="budget-title">{range.label}</span>
          </div>

          <div className="budget-toolbar-right">
            <label className="ops-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                value={search}
                placeholder="Поиск по операциям"
                aria-label="Поиск по операциям"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="icon-button"
              aria-label={filtersOpen ? "Скрыть фильтры" : "Показать фильтры"}
              title={filtersOpen ? "Скрыть фильтры" : "Показать фильтры"}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              {filtersOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <button
              type="button"
              className="intro-submit budget-add"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus size={16} />
              Добавить операцию
            </button>
          </div>
        </div>

        {filtersOpen && (
          <div className="ops-filters">
            <label className="ops-filter">
              <span>Период:</span>
              <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodFilter)}>
                <option value="week">Неделя</option>
                <option value="month">Месяц</option>
                <option value="year">Год</option>
                <option value="all">Всё время</option>
              </select>
            </label>
            <label className="ops-filter">
              <span>Тип:</span>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}>
                <option value="all">Все</option>
                <option value="income">Доход</option>
                <option value="expense">Расход</option>
                <option value="transfer">Перевод</option>
              </select>
            </label>
            <label className="ops-filter">
              <span>Статус:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              >
                <option value="all">Все</option>
                <option value="actual">Факт</option>
                <option value="planned">План</option>
              </select>
            </label>
            <label className="ops-filter">
              <span>Счёт:</span>
              <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
                <option value="all">Все счета</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-filter">
              <span>Категория:</span>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">Все категории</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="ops-stats">
          <div className="ops-stat">
            <span className="ops-stat-label">Доходы</span>
            <span className="ops-stat-value amount--income">{formatMoney(stats.income)}</span>
            <span className="ops-stat-icon ops-stat-icon--income">
              <ArrowDown size={18} />
            </span>
          </div>
          <div className="ops-stat">
            <span className="ops-stat-label">Расходы</span>
            <span className="ops-stat-value">{formatMoney(stats.expense)}</span>
            <span className="ops-stat-icon ops-stat-icon--expense">
              <ArrowUp size={18} />
            </span>
          </div>
          <div className="ops-stat">
            <span className="ops-stat-label">Итог</span>
            <span
              className={
                stats.net < 0 ? "ops-stat-value amount--expense" : "ops-stat-value amount--income"
              }
            >
              {signedMoney(stats.net)}
            </span>
            <span className="ops-stat-icon ops-stat-icon--net">
              <Activity size={18} />
            </span>
          </div>
        </div>

        {error && <p className="error-text ops-error">{error}</p>}

        {days.length === 0 ? (
          <p className="ops-empty">Операций нет. Добавьте первую или измените фильтры.</p>
        ) : (
          <div className="ops-list">
            {days.map((day) => {
              const isCollapsed = collapsedDays.has(day.date);
              return (
                <section key={day.date} className="ops-day">
                  <header className="ops-day-head">
                    <span className="ops-day-date">{dayLabel(day.date)}</span>
                    <span className="ops-day-total">
                      Итог дня:{" "}
                      <span className={day.total < 0 ? "amount--expense" : "amount--income"}>
                        {signedMoney(day.total)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={isCollapsed ? "Развернуть день" : "Свернуть день"}
                      onClick={() => toggleDay(day.date)}
                    >
                      {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </button>
                  </header>

                  {!isCollapsed && (
                    <ul className="ops-rows">
                      {day.items.map((op) => {
                        const category = op.categoryId ? categoryMap.get(op.categoryId) : null;
                        const name =
                          op.type === "transfer" ? "Перевод" : category?.name ?? "Без статьи";
                        const { Icon, color } = categoryVisual(name);
                        const account = accountMap.get(op.accountId)?.name ?? "—";
                        const target = op.targetAccountId
                          ? accountMap.get(op.targetAccountId)?.name
                          : null;
                        const subtitle =
                          op.type === "transfer"
                            ? `${account} → ${target ?? "—"}`
                            : [op.description, account].filter(Boolean).join(" · ");
                        const signed =
                          op.type === "income" ? op.amount : op.type === "expense" ? -op.amount : 0;
                        return (
                          <li key={op.id} className="ops-row">
                            <span
                              className="ops-row-icon"
                              style={{ color, background: `${color}1a` }}
                              aria-hidden="true"
                            >
                              <Icon size={18} />
                            </span>
                            <span className="ops-row-info">
                              <span className="ops-row-name">
                                {name}
                                {op.recurringId && (
                                  <span className="ops-row-recurring" title="Регулярная операция">
                                    <Repeat size={13} />
                                  </span>
                                )}
                              </span>
                              <span className="ops-row-sub">{subtitle || "—"}</span>
                            </span>

                            <span
                              className={
                                signed > 0
                                  ? "ops-row-amount amount--income"
                                  : signed < 0
                                    ? "ops-row-amount amount--expense"
                                    : "ops-row-amount"
                              }
                            >
                              {op.type === "transfer" ? formatMoney(op.amount) : signedMoney(signed)}
                            </span>

                            {pendingIds.has(op.id) ? (
                              <span className="ops-row-badge">Ожидает подтверждения</span>
                            ) : op.status === "planned" ? (
                              <span className="status-badge status-badge--planned">План</span>
                            ) : (
                              <span className="ops-row-badge-space" />
                            )}

                            <span className="ops-row-menu">
                              <button
                                type="button"
                                className="icon-button"
                                aria-label="Действия с операцией"
                                onClick={() => setMenuFor(menuFor === op.id ? null : op.id)}
                              >
                                <EllipsisVertical size={16} />
                              </button>
                              {menuFor === op.id && (
                                <>
                                  <span
                                    className="ops-menu-backdrop"
                                    onClick={() => setMenuFor(null)}
                                  />
                                  <span className="ops-menu" role="menu">
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                        setEditing(op);
                                        setFormOpen(true);
                                        setMenuFor(null);
                                      }}
                                    >
                                      Изменить
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="ops-menu-danger"
                                      onClick={() => void handleDelete(op.id)}
                                    >
                                      Удалить
                                    </button>
                                  </span>
                                </>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <div className="ops-footer">
          <span className="ops-footer-count">
            {filtered.length}{" "}
            {filtered.length % 10 === 1 && filtered.length % 100 !== 11
              ? "операция"
              : filtered.length % 10 >= 2 &&
                  filtered.length % 10 <= 4 &&
                  (filtered.length % 100 < 12 || filtered.length % 100 > 14)
                ? "операции"
                : "операций"}
          </span>
          <span className="ops-footer-total">
            Итого за период:{" "}
            <span className={stats.net < 0 ? "amount--expense" : "amount--income"}>
              {signedMoney(stats.net)}
            </span>
          </span>
        </div>
      </div>

      {formOpen && (
        <OperationForm
          accounts={accounts}
          categories={categories}
          initial={editing}
          onSave={handleSave}
          onDelete={handleDelete}
          onCancel={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
