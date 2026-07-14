import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ColumnDef,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable
} from "@tanstack/react-table";
import type { Category, Operation } from "../types";
import type { Week } from "../lib/finance";
import { suggestWeeklyAverages } from "../lib/finance";
import {
  listCategories,
  listCategoryPlans,
  listOperations,
  upsertCategoryPlan
} from "../lib/repository";

function shortWeek(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}.${match[2]}` : iso;
}

function planKey(weekStart: string, categoryId: string) {
  return `${weekStart}|${categoryId}`;
}

// Ячейка с локальным состоянием: типизируем свободно, пишем в БД по blur.
function PlanCell({
  initial,
  onCommit
}: {
  initial: number;
  onCommit: (amount: number) => void;
}) {
  const [value, setValue] = useState(initial ? String(initial) : "");
  return (
    <input
      type="number"
      className="plan-cell"
      value={value}
      placeholder="0"
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(Number(value) || 0)}
    />
  );
}

type PlanTableProps = {
  weeks: Week[];
};

export function PlanTable({ weeks }: PlanTableProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // revision форсит перемонтирование ячеек после массового заполнения.
  const [revision, setRevision] = useState(0);
  // Суммы плана держим в ref, чтобы правка ячейки не перерисовывала всю таблицу.
  const plansRef = useRef<Map<string, number>>(new Map());

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [cats, plans, ops] = await Promise.all([
        listCategories(),
        listCategoryPlans(),
        listOperations()
      ]);
      setOperations(ops);
      const map = new Map<string, number>();
      for (const plan of plans) map.set(planKey(plan.weekStart, plan.categoryId), plan.amount);
      plansRef.current = map;
      // доходы сверху, затем расходы; внутри — по алфавиту
      setCategories(
        [...cats].sort((a, b) =>
          a.type === b.type ? a.name.localeCompare(b.name) : a.type === "income" ? -1 : 1
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const commit = useCallback(async (weekStart: string, categoryId: string, amount: number) => {
    const key = planKey(weekStart, categoryId);
    if (amount) plansRef.current.set(key, amount);
    else plansRef.current.delete(key);
    try {
      await upsertCategoryPlan(weekStart, categoryId, amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Средние по статьям за прошлый год (для подсказки при создании плана).
  const suggestions = useMemo(
    () =>
      weeks.length > 0
        ? suggestWeeklyAverages(operations, Number(weeks[0].start.slice(0, 4)))
        : new Map<string, number>(),
    [operations, weeks]
  );
  const hasSuggestions = Array.from(suggestions.values()).some((value) => value > 0);

  // Заполняет средними только пустые ячейки, чтобы не затирать правки.
  const applySuggestions = useCallback(async () => {
    const writes: Promise<void>[] = [];
    for (const category of categories) {
      const avg = suggestions.get(category.id) ?? 0;
      if (avg <= 0) continue;
      for (const week of weeks) {
        const key = planKey(week.start, category.id);
        if (plansRef.current.get(key)) continue;
        plansRef.current.set(key, avg);
        writes.push(upsertCategoryPlan(week.start, category.id, avg));
      }
    }
    try {
      await Promise.all(writes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setRevision((value) => value + 1);
  }, [categories, suggestions, weeks]);

  const columns = useMemo<ColumnDef<Category, any>[]>(() => {
    const helper = createColumnHelper<Category>();
    return [
      helper.accessor("name", {
        id: "category",
        header: "Статья",
        cell: (info) => (
          <span className="plan-cat">
            <span className="cat-swatch" style={{ background: info.row.original.color }} />
            {info.getValue()}
          </span>
        )
      }),
      ...weeks.map((week) =>
        helper.display({
          id: `week-${week.start}`,
          header: shortWeek(week.start),
          cell: ({ row }) => {
            const category = row.original;
            return (
              <PlanCell
                key={`${planKey(week.start, category.id)}:${revision}`}
                initial={plansRef.current.get(planKey(week.start, category.id)) ?? 0}
                onCommit={(amount) => commit(week.start, category.id, amount)}
              />
            );
          }
        })
      )
    ];
  }, [weeks, commit, revision]);

  const table = useReactTable({
    data: categories,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  if (loading) {
    return <div className="panel panel--empty">Загрузка плана…</div>;
  }

  if (error) {
    return (
      <div className="panel">
        <p className="error-text">{error}</p>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="panel panel--empty">
        <p className="panel-lead">
          Сначала добавьте статьи доходов и расходов в разделе «Настройки».
        </p>
      </div>
    );
  }

  return (
    <div className="plan-block">
      <div className="plan-toolbar">
        <button
          type="button"
          className="intro-secondary"
          disabled={!hasSuggestions}
          onClick={applySuggestions}
        >
          Заполнить средними за прошлый год
        </button>
        <span className="plan-hint">
          {hasSuggestions
            ? "Подставит средние по факту прошлого года в пустые ячейки."
            : "Нет факта за прошлый год — подсказка недоступна."}
        </span>
      </div>

      <div className="plan-table-wrap">
      <table className="plan-table">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
