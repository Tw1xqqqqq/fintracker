import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Sparkles
} from "lucide-react";
import type { Account, Category, Operation, RecurringRule } from "../types";
import type { Week } from "../lib/finance";
import {
  manualPlanAmountForTarget,
  suggestWeeklyAverages,
  sumAccountBalances
} from "../lib/finance";
import {
  countOperationsForCategory,
  deleteCategory,
  deleteOperation,
  getSetting,
  listAccounts,
  listCategories,
  listOperations,
  regenerateRecurringOperations,
  upsertCategory,
  upsertOperation,
  upsertRecurringRule
} from "../lib/repository";
import { CategoryForm } from "./CategoryForm";
import { OperationPopover } from "./OperationPopover";

const PAGE_SIZE = 6;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function shortDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}.${match[2]}` : iso;
}

function planKey(weekStart: string, categoryId: string) {
  return `${weekStart}|${categoryId}`;
}

function manualPlanId(weekStart: string, categoryId: string) {
  return `manual-plan:${weekStart}:${categoryId}`;
}

type Mode = "plan" | "fact" | "diff";

type BudgetTableProps = {
  weeks: Week[];
  onEditYear: () => void;
};

export function BudgetTable({ weeks, onEditYear }: BudgetTableProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  // Счёт для создаваемых план-операций: primaryAccountId из настроек, иначе первый.
  const [defaultAccountId, setDefaultAccountId] = useState("");
  const [operations, setOperations] = useState<Operation[]>([]);
  const [initialBalance, setInitialBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("plan");
  const [collapsed, setCollapsed] = useState<{ income: boolean; expense: boolean }>({
    income: false,
    expense: false
  });
  // revision форсит перемонтирование ячеек после массового заполнения средними
  const [revision, setRevision] = useState(0);

  const [formType, setFormType] = useState<Category["type"] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [operationContext, setOperationContext] = useState<{
    categoryId: string;
    date: string;
    status: "actual" | "planned";
  } | null>(null);

  const today = todayIso();
  const currentIdx = useMemo(
    () => weeks.findIndex((week) => today >= week.start && today <= week.end),
    [weeks, today]
  );

  const [pageStart, setPageStart] = useState(() => {
    const idx = weeks.findIndex((week) => today >= week.start && today <= week.end);
    return idx >= 0 ? Math.floor(idx / PAGE_SIZE) * PAGE_SIZE : 0;
  });

  useEffect(() => {
    if (pageStart >= weeks.length) setPageStart(0);
  }, [weeks.length, pageStart]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [cats, ops, accounts, primaryId] = await Promise.all([
        listCategories(),
        listOperations(),
        listAccounts(),
        getSetting("primaryAccountId")
      ]);
      setOperations(ops);
      setAccounts(accounts);
      setDefaultAccountId(
        accounts.find((account) => account.id === primaryId)?.id ?? accounts[0]?.id ?? ""
      );
      setInitialBalance(sumAccountBalances(accounts));
      setCategories([...cats].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const incomeCats = useMemo(() => categories.filter((c) => c.type === "income"), [categories]);
  const expenseCats = useMemo(() => categories.filter((c) => c.type === "expense"), [categories]);

  const plannedByCell = useMemo(() => {
    const totals = new Map<string, number>();
    const manual = new Map<string, number>();
    for (const operation of operations) {
      if (operation.status !== "planned" || operation.type === "transfer" || !operation.categoryId) {
        continue;
      }
      const week = weeks.find((item) => operation.date >= item.start && operation.date <= item.end);
      if (!week) continue;
      const key = planKey(week.start, operation.categoryId);
      totals.set(key, (totals.get(key) ?? 0) + operation.amount);
      if (operation.id.startsWith("manual-plan:")) {
        manual.set(key, (manual.get(key) ?? 0) + operation.amount);
      }
    }
    return { totals, manual };
  }, [operations, weeks]);

  // Факт по ячейкам: `${weekIdx}|${categoryId}` -> сумма фактических операций.
  const factByCell = useMemo(() => {
    const map = new Map<string, number>();
    if (weeks.length === 0) return map;
    const firstMs = Date.parse(`${weeks[0].start}T00:00:00Z`);
    for (const op of operations) {
      if (op.status !== "actual" || op.type === "transfer") continue;
      const ms = Date.parse(`${op.date}T00:00:00Z`);
      if (Number.isNaN(ms)) continue;
      const idx = Math.floor((ms - firstMs) / WEEK_MS);
      if (idx < 0 || idx >= weeks.length) continue;
      if (op.date < weeks[idx].start || op.date > weeks[idx].end) continue;
      const key = `${idx}|${op.categoryId}`;
      map.set(key, (map.get(key) ?? 0) + op.amount);
    }
    return map;
  }, [operations, weeks]);

  const planAt = useCallback(
    (weekIdx: number, categoryId: string) =>
      plannedByCell.totals.get(planKey(weeks[weekIdx].start, categoryId)) ?? 0,
    [plannedByCell, weeks]
  );

  const factAt = useCallback(
    (weekIdx: number, categoryId: string) => factByCell.get(`${weekIdx}|${categoryId}`) ?? 0,
    [factByCell]
  );

  // Итоги по группам и балансовые ряды на все недели (не только страницу).
  const totals = useMemo(() => {
    const n = weeks.length;
    const planIncome = new Array<number>(n).fill(0);
    const planExpense = new Array<number>(n).fill(0);
    const factIncome = new Array<number>(n).fill(0);
    const factExpense = new Array<number>(n).fill(0);

    for (let i = 0; i < n; i += 1) {
      for (const cat of incomeCats) {
        planIncome[i] += planAt(i, cat.id);
        factIncome[i] += factAt(i, cat.id);
      }
      for (const cat of expenseCats) {
        planExpense[i] += planAt(i, cat.id);
        factExpense[i] += factAt(i, cat.id);
      }
    }

    const runningPlan = new Array<number>(n).fill(0);
    const runningFact = new Array<number>(n).fill(0);
    let accPlan = initialBalance;
    let accFact = initialBalance;
    for (let i = 0; i < n; i += 1) {
      accPlan += planIncome[i] - planExpense[i];
      accFact += factIncome[i] - factExpense[i];
      runningPlan[i] = accPlan;
      runningFact[i] = accFact;
    }

    return { planIncome, planExpense, factIncome, factExpense, runningPlan, runningFact };
  }, [weeks.length, incomeCats, expenseCats, planAt, factAt, initialBalance]);

  const suggestions = useMemo(
    () =>
      weeks.length > 0
        ? suggestWeeklyAverages(operations, Number(weeks[0].start.slice(0, 4)))
        : new Map<string, number>(),
    [operations, weeks]
  );
  const hasSuggestions = Array.from(suggestions.values()).some((value) => value > 0);

  const applySuggestions = useCallback(async () => {
    const accountId = defaultAccountId;
    if (!accountId) {
      setError("Сначала добавьте хотя бы один счёт.");
      return;
    }
    const writes: Promise<void>[] = [];
    for (const category of categories) {
      const avg = suggestions.get(category.id) ?? 0;
      if (avg <= 0) continue;
      for (let weekIdx = 0; weekIdx < weeks.length; weekIdx += 1) {
        const week = weeks[weekIdx];
        if (planAt(weekIdx, category.id) > 0) continue;
        writes.push(
          upsertOperation({
            id: manualPlanId(week.start, category.id),
            date: week.start,
            type: category.type,
            status: "planned",
            categoryId: category.id,
            accountId,
            amount: avg,
            description: "Ручной план"
          })
        );
      }
    }
    try {
      await Promise.all(writes);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setRevision((value) => value + 1);
  }, [defaultAccountId, categories, planAt, suggestions, weeks]);

  const handleSaveCategory = async (category: Category) => {
    await upsertCategory(category);
    setFormType(null);
    await load();
  };

  const handleDeleteCategory = async (id: string) => {
    const used = await countOperationsForCategory(id);
    if (used > 0) {
      setFormError(`Статья используется в ${used} операц. — удаление недоступно.`);
      return;
    }
    await deleteCategory(id);
    setFormType(null);
    await load();
  };

  const handleSavePopover = async (
    operation: Operation | null,
    recurringRule: RecurringRule | null
  ) => {
    try {
      if (operation) {
        await upsertOperation(operation);
      }
      if (recurringRule) {
        await upsertRecurringRule(recurringRule);
        await regenerateRecurringOperations();
      }
      setOperationContext(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSavePlan = async (weekStart: string, categoryId: string, rawValue: string) => {
    const targetAmount = rawValue.trim() === "" ? 0 : Number(rawValue);
    if (!Number.isFinite(targetAmount) || targetAmount < 0) {
      setError("Плановая сумма должна быть неотрицательным числом.");
      setRevision((value) => value + 1);
      return;
    }

    const key = planKey(weekStart, categoryId);
    const totalAmount = plannedByCell.totals.get(key) ?? 0;
    const currentManualAmount = plannedByCell.manual.get(key) ?? 0;
    const recurringAmount = totalAmount - currentManualAmount;
    const manualAmount = manualPlanAmountForTarget(
      targetAmount,
      totalAmount,
      currentManualAmount
    );
    if (manualAmount === null) {
      setError(
        `В этой неделе уже есть отдельные плановые записи (регулярные или добавленные через «+») ` +
          `на ${fmt.format(recurringAmount)} ₽. Чтобы опустить сумму ниже, измените или удалите их.`
      );
      setRevision((value) => value + 1);
      return;
    }

    const category = categories.find((item) => item.id === categoryId);
    const accountId = defaultAccountId;
    if (!category || !accountId) {
      setError("Для планирования нужны категория и хотя бы один счёт.");
      return;
    }

    const id = manualPlanId(weekStart, categoryId);
    setError(null);
    try {
      if (manualAmount === 0) {
        await deleteOperation(id);
      } else {
        await upsertOperation({
          id,
          date: weekStart,
          type: category.type,
          status: "planned",
          categoryId,
          accountId,
          amount: manualAmount,
          description: "Ручной план"
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    }
  };

  const pageWeeks = weeks.slice(pageStart, pageStart + PAGE_SIZE);

  const dash = <span className="budget-dash">—</span>;

  const numOrDash = (value: number) => (value ? fmt.format(value) : dash);

  // Ячейка статьи по режиму: план — редактируемая, факт — число, сравнение — дельта.
  const catCell = (category: Category, globalIdx: number) => {
    if (mode === "plan") {
      const value = planAt(globalIdx, category.id);
      const weekStart = weeks[globalIdx].start;
      return (
        <span className="plan-cell-wrap" key={`${planKey(weekStart, category.id)}:${value}:${revision}`}>
          <button
            type="button"
            className="plan-cell-add"
            aria-label={`Добавить плановую запись: ${category.name}, ${shortDate(weekStart)}`}
            title="Добавить плановую запись (с регулярностью)"
            onClick={() =>
              setOperationContext({ categoryId: category.id, date: weekStart, status: "planned" })
            }
          >
            <Plus size={12} />
          </button>
          <input
            type="number"
            min="0"
            step="0.01"
            className="plan-cell"
            aria-label={`План: ${category.name}, ${shortDate(weekStart)}`}
            defaultValue={value || ""}
            placeholder="—"
            onBlur={(event) => void handleSavePlan(weekStart, category.id, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </span>
      );
    }

    if (mode === "fact") {
      return (
        <button
          type="button"
          className="budget-entry-cell"
          aria-label={`Добавить запись: ${category.name}, ${shortDate(weeks[globalIdx].start)}`}
          onClick={() =>
            setOperationContext({
              categoryId: category.id,
              date: weeks[globalIdx].start,
              status: "actual"
            })
          }
        >
          {numOrDash(factAt(globalIdx, category.id))}
        </button>
      );
    }

    const diff = factAt(globalIdx, category.id) - planAt(globalIdx, category.id);
    return diffNode(diff, category.type);
  };

  const diffNode = (diff: number, type: Category["type"]) => {
    if (diff === 0) return dash;
    const good = type === "income" ? diff > 0 : diff < 0;
    return (
      <span className={good ? "amount amount--income" : "amount amount--expense"}>
        {diff > 0 ? "+" : ""}
        {fmt.format(diff)}
      </span>
    );
  };

  // Итог группы за неделю в текущем режиме.
  const groupValue = (globalIdx: number, type: Category["type"]) => {
    const plan = type === "income" ? totals.planIncome : totals.planExpense;
    const fact = type === "income" ? totals.factIncome : totals.factExpense;
    if (mode === "plan") return numOrDashColored(plan[globalIdx], type);
    if (mode === "fact") return numOrDashColored(fact[globalIdx], type);
    return diffNode(fact[globalIdx] - plan[globalIdx], type);
  };

  const numOrDashColored = (value: number, type: Category["type"]) => {
    const cls = type === "income" ? "budget-dash budget-dash--income" : "budget-dash budget-dash--expense";
    if (!value) return <span className={cls}>—</span>;
    return fmt.format(value);
  };

  // Недельный нетто (доход − расход) и накопленный остаток в текущем режиме.
  const netValue = (globalIdx: number) => {
    const netPlan = totals.planIncome[globalIdx] - totals.planExpense[globalIdx];
    const netFact = totals.factIncome[globalIdx] - totals.factExpense[globalIdx];
    if (mode === "plan") return numOrDash(netPlan);
    if (mode === "fact") return numOrDash(netFact);
    const diff = netFact - netPlan;
    return diff === 0 ? dash : (
      <span className={diff > 0 ? "amount amount--income" : "amount amount--expense"}>
        {diff > 0 ? "+" : ""}
        {fmt.format(diff)}
      </span>
    );
  };

  const runningValue = (globalIdx: number) => {
    if (mode === "plan") return fmt.format(totals.runningPlan[globalIdx]);
    if (mode === "fact") return fmt.format(totals.runningFact[globalIdx]);
    const diff = totals.runningFact[globalIdx] - totals.runningPlan[globalIdx];
    return diff === 0 ? dash : (
      <span className={diff > 0 ? "amount amount--income" : "amount amount--expense"}>
        {diff > 0 ? "+" : ""}
        {fmt.format(diff)}
      </span>
    );
  };

  const weekTd = (globalIdx: number, content: React.ReactNode, extra = "") => (
    <td
      key={globalIdx}
      className={`${globalIdx === currentIdx ? "budget-col--current" : ""} ${extra}`.trim()}
    >
      {content}
    </td>
  );

  if (loading) {
    return <div className="panel panel--empty">Загрузка бюджета…</div>;
  }

  if (error && categories.length === 0) {
    return (
      <div className="panel">
        <p className="panel-lead">Не удалось загрузить бюджет.</p>
        <p className="error-text">{error}</p>
        <p className="panel-lead">
          Бюджет доступен только в десктоп-приложении (SQLite). Запустите его через
          <code> npm run tauri dev</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="panel budget-panel">
      <div className="budget-toolbar">
        <div className="budget-toolbar-left">
          <span className="budget-title">Бюджет на год</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Предыдущие недели"
            disabled={pageStart === 0}
            onClick={() => setPageStart(Math.max(0, pageStart - PAGE_SIZE))}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Следующие недели"
            disabled={pageStart + PAGE_SIZE >= weeks.length}
            onClick={() => setPageStart(pageStart + PAGE_SIZE)}
          >
            <ChevronRight size={16} />
          </button>
          <span className="budget-range">
            Недели {pageStart + 1}–{pageStart + pageWeeks.length}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Изменить финансовый год"
            title="Изменить финансовый год"
            onClick={onEditYear}
          >
            <Pencil size={14} />
          </button>
        </div>

        <div className="budget-toolbar-right">
          <select className="budget-granularity" disabled title="Другие периоды — скоро">
            <option>Неделя</option>
          </select>

          <div className="segmented">
            <button
              type="button"
              className={mode === "plan" ? "segmented--active" : ""}
              onClick={() => setMode("plan")}
            >
              План
            </button>
            <button
              type="button"
              className={mode === "fact" ? "segmented--active" : ""}
              onClick={() => setMode("fact")}
            >
              Факт
            </button>
            <button
              type="button"
              className={mode === "diff" ? "segmented--active" : ""}
              onClick={() => setMode("diff")}
            >
              Сравнение
            </button>
          </div>

          {mode === "plan" && (
            <button
              type="button"
              className="icon-button"
              disabled={!hasSuggestions}
              title={
                hasSuggestions
                  ? "Заполнить пустые ячейки средними за прошлый год"
                  : "Нет факта за прошлый год — подсказка недоступна"
              }
              onClick={applySuggestions}
            >
              <Sparkles size={16} />
            </button>
          )}

          <button
            type="button"
            className="intro-submit budget-add"
            onClick={() => {
              setFormError(null);
              setFormType("expense");
            }}
          >
            <Plus size={16} />
            Добавить категорию
          </button>

        </div>
      </div>

      {error && categories.length > 0 && <p className="error-text budget-error">{error}</p>}

      <div className="budget-table-wrap">
        <table className="budget-table">
          <thead>
            <tr>
              <th>Категория</th>
              {pageWeeks.map((week, i) => {
                const globalIdx = pageStart + i;
                return (
                  <th
                    key={week.start}
                    className={globalIdx === currentIdx ? "budget-col--current" : ""}
                  >
                    <div className="budget-week-head">
                      <span>Неделя {globalIdx + 1}</span>
                      <span className="budget-week-sub">
                        {shortDate(week.start)} – {shortDate(week.end)}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr className="budget-row--group">
              <td>
                <span className="budget-group-cell">
                  <button
                    type="button"
                    className="budget-group-toggle"
                    aria-label={collapsed.income ? "Развернуть доходы" : "Свернуть доходы"}
                    onClick={() => setCollapsed((c) => ({ ...c, income: !c.income }))}
                  >
                    {collapsed.income ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                  Доходы
                  <button
                    type="button"
                    className="budget-group-add"
                    aria-label="Добавить статью дохода"
                    onClick={() => {
                      setFormError(null);
                      setFormType("income");
                    }}
                  >
                    <Plus size={13} />
                  </button>
                </span>
              </td>
              {pageWeeks.map((_, i) => weekTd(pageStart + i, groupValue(pageStart + i, "income")))}
            </tr>

            {!collapsed.income &&
              incomeCats.map((category) => (
                <tr key={category.id}>
                  <td>
                    <span className="budget-cat-cell">
                      <span className="cat-swatch" style={{ background: category.color }} />
                      {category.name}
                    </span>
                  </td>
                  {pageWeeks.map((_, i) => weekTd(pageStart + i, catCell(category, pageStart + i)))}
                </tr>
              ))}

            <tr className="budget-row--total">
              <td>Баланс</td>
              {pageWeeks.map((_, i) => weekTd(pageStart + i, netValue(pageStart + i)))}
            </tr>

            <tr className="budget-row--group">
              <td>
                <span className="budget-group-cell">
                  <button
                    type="button"
                    className="budget-group-toggle"
                    aria-label={collapsed.expense ? "Развернуть расходы" : "Свернуть расходы"}
                    onClick={() => setCollapsed((c) => ({ ...c, expense: !c.expense }))}
                  >
                    {collapsed.expense ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                  Расходы
                  <button
                    type="button"
                    className="budget-group-add"
                    aria-label="Добавить статью расхода"
                    onClick={() => {
                      setFormError(null);
                      setFormType("expense");
                    }}
                  >
                    <Plus size={13} />
                  </button>
                </span>
              </td>
              {pageWeeks.map((_, i) => weekTd(pageStart + i, groupValue(pageStart + i, "expense")))}
            </tr>

            {!collapsed.expense &&
              expenseCats.map((category) => (
                <tr key={category.id}>
                  <td>
                    <span className="budget-cat-cell">
                      <span className="cat-swatch" style={{ background: category.color }} />
                      {category.name}
                    </span>
                  </td>
                  {pageWeeks.map((_, i) => weekTd(pageStart + i, catCell(category, pageStart + i)))}
                </tr>
              ))}

            <tr className="budget-row--total">
              <td>Итоговый баланс</td>
              {pageWeeks.map((_, i) => weekTd(pageStart + i, runningValue(pageStart + i)))}
            </tr>
          </tbody>
        </table>
      </div>

      {categories.length === 0 && (
        <p className="budget-empty">
          Статей пока нет — добавьте первую кнопкой «Добавить категорию».
        </p>
      )}

      {formType !== null && (
        <CategoryForm
          initial={null}
          defaultType={formType}
          error={formError}
          onSave={handleSaveCategory}
          onDelete={handleDeleteCategory}
          onCancel={() => setFormType(null)}
        />
      )}

      {operationContext !== null && (
        <OperationPopover
          accounts={accounts}
          categories={categories}
          initialCategoryId={operationContext.categoryId}
          initialDate={operationContext.date}
          defaultAccountId={defaultAccountId}
          status={operationContext.status}
          onCancel={() => setOperationContext(null)}
          onSave={handleSavePopover}
        />
      )}
    </div>
  );
}
