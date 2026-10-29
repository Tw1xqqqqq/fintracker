import { useState } from "react";
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import type { Account, Operation } from "../types";
import { formatMoney } from "../lib/finance";
import { shortDate } from "../lib/dates";

type CellOperationsPopoverProps = {
  title: string;
  subtitle: string;
  operations: Operation[];
  accounts: Account[];
  error: string | null;
  onAdd: () => void;
  onEdit: (operation: Operation) => void;
  onDelete: (operation: Operation) => Promise<void>;
  onCancel: () => void;
};

// Список операций ячейки бюджета: изменить или удалить ошибочную запись прямо
// из таблицы, не уходя в журнал. Удаление — в два клика (подтверждение в строке).
export function CellOperationsPopover({
  title,
  subtitle,
  operations,
  accounts,
  error,
  onAdd,
  onEdit,
  onDelete,
  onCancel
}: CellOperationsPopoverProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.name ?? "—";

  const handleDelete = async (operation: Operation) => {
    setDeletingId(operation.id);
    try {
      await onDelete(operation);
      setConfirmingId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="operation-popover cell-ops"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cell-ops-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <p id="cell-ops-title" className="operation-popover-title">
            {title}
          </p>
          <p className="cell-ops-subtitle">{subtitle}</p>
        </div>

        <ul className="cell-ops-list">
          {operations.map((operation) => (
            <li key={operation.id} className="cell-ops-item">
              <span className="cell-ops-info">
                <span className="cell-ops-main">
                  {shortDate(operation.date)}
                  {operation.recurringId && (
                    <span className="cell-ops-recurring" title="Регулярный платёж">
                      <Repeat size={12} />
                    </span>
                  )}
                  <span className="cell-ops-desc">{operation.description || "Без комментария"}</span>
                </span>
                <span className="cell-ops-account">{accountName(operation.accountId)}</span>
              </span>
              <span className="cell-ops-amount">{formatMoney(operation.amount)}</span>
              {confirmingId === operation.id ? (
                <span className="cell-ops-confirm">
                  <button
                    type="button"
                    className="cell-ops-confirm-yes"
                    disabled={deletingId === operation.id}
                    onClick={() => void handleDelete(operation)}
                  >
                    Удалить
                  </button>
                  <button type="button" className="cell-ops-confirm-no" onClick={() => setConfirmingId(null)}>
                    Нет
                  </button>
                </span>
              ) : (
                <span className="cell-ops-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Изменить запись"
                    title="Изменить"
                    onClick={() => onEdit(operation)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Удалить запись"
                    title="Удалить"
                    onClick={() => setConfirmingId(operation.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>

        {error && <p className="error-text">{error}</p>}

        <div className="operation-popover-actions">
          <button type="button" className="operation-popover-cancel" onClick={onCancel}>
            Закрыть
          </button>
          <button type="button" className="operation-popover-submit" onClick={onAdd}>
            <Plus size={14} />
            Добавить запись
          </button>
        </div>
      </div>
    </div>
  );
}
