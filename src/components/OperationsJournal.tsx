import { useEffect, useMemo, useState } from "react";
import {
  ColumnDef,
  SortingState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Plus } from "lucide-react";
import type { Account, Category, Operation, OperationType } from "../types";
import { formatMoney } from "../lib/finance";
import {
  deleteOperation,
  listAccounts,
  listCategories,
  listOperations,
  seedIfEmpty,
  upsertOperation
} from "../lib/repository";
import { OperationForm } from "./OperationForm";

const TYPE_LABELS: Record<OperationType, string> = {
  income: "Доход",
  expense: "Расход",
  transfer: "Перевод"
};

function formatDate(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    parsed
  );
}

type TypeFilter = OperationType | "all";

export function OperationsJournal() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Operation | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      await seedIfEmpty();
      const [ops, accs, cats] = await Promise.all([
        listOperations(),
        listAccounts(),
        listCategories()
      ]);
      setOperations(ops);
      setAccounts(accs);
      setCategories(cats);
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

  const filtered = useMemo(() => {
    return operations.filter((op) => {
      if (typeFilter !== "all" && op.type !== typeFilter) return false;
      if (from && op.date < from) return false;
      if (to && op.date > to) return false;
      return true;
    });
  }, [operations, typeFilter, from, to]);

  const columns = useMemo<ColumnDef<Operation, any>[]>(() => {
    const helper = createColumnHelper<Operation>();
    return [
      helper.accessor("date", {
        header: "Дата",
        cell: (info) => formatDate(info.getValue())
      }),
      helper.accessor("type", {
        header: "Тип",
        cell: (info) => TYPE_LABELS[info.getValue() as OperationType]
      }),
      helper.accessor((row) => categoryMap.get(row.categoryId)?.name ?? "—", {
        id: "category",
        header: "Статья"
      }),
      helper.accessor((row) => accountMap.get(row.accountId)?.name ?? "—", {
        id: "account",
        header: "Счёт"
      }),
      helper.accessor("amount", {
        header: "Сумма",
        cell: (info) => {
          const op = info.row.original;
          const sign = op.type === "expense" ? "−" : op.type === "income" ? "+" : "";
          return (
            <span className={`amount amount--${op.type}`}>
              {sign}
              {formatMoney(info.getValue())}
            </span>
          );
        }
      }),
      helper.accessor("status", {
        header: "Статус",
        cell: (info) => (
          <span className={`status-badge status-badge--${info.getValue()}`}>
            {info.getValue() === "planned" ? "План" : "Факт"}
          </span>
        )
      })
    ];
  }, [accountMap, categoryMap]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (operation: Operation) => {
    setEditing(operation);
    setFormOpen(true);
  };

  const handleSave = async (operation: Operation) => {
    await upsertOperation(operation);
    setFormOpen(false);
    await reload();
  };

  const handleDelete = async (id: string) => {
    await deleteOperation(id);
    setFormOpen(false);
    await reload();
  };

  if (loading) {
    return <div className="panel panel--empty">Загрузка операций…</div>;
  }

  if (error) {
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

  return (
    <div className="journal">
      <div className="journal-toolbar">
        <div className="filters">
          <label className="filter">
            <span>Тип</span>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}>
              <option value="all">Все</option>
              <option value="income">Доход</option>
              <option value="expense">Расход</option>
              <option value="transfer">Перевод</option>
            </select>
          </label>
          <label className="filter">
            <span>С</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="filter">
            <span>По</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          {(typeFilter !== "all" || from || to) && (
            <button
              type="button"
              className="intro-secondary"
              onClick={() => {
                setTypeFilter("all");
                setFrom("");
                setTo("");
              }}
            >
              Сбросить
            </button>
          )}
        </div>

        <button type="button" className="intro-submit" onClick={openNew}>
          <Plus size={18} />
          Добавить
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="sortable"
                    >
                      <span className="th-inner">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" ? (
                          <ArrowUp size={14} />
                        ) : sorted === "desc" ? (
                          <ArrowDown size={14} />
                        ) : (
                          <ChevronsUpDown size={14} className="th-sort-idle" />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="data-row" onClick={() => openEdit(row.original)}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="empty-row">
                  Операций нет. Добавьте первую или измените фильтры.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
