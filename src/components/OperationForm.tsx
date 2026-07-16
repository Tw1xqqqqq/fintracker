import { FormEvent, useMemo, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Account, Category, Operation, OperationStatus, OperationType } from "../types";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type OperationFormProps = {
  accounts: Account[];
  categories: Category[];
  initial: Operation | null;
  onSave: (operation: Operation) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
};

export function OperationForm({
  accounts,
  categories,
  initial,
  onSave,
  onDelete,
  onCancel
}: OperationFormProps) {
  const defaultSourceAccountId = initial?.sourceAccountId ?? initial?.accountId ?? accounts[0]?.id ?? "";
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [type, setType] = useState<OperationType>(initial?.type ?? "expense");
  const [status, setStatus] = useState<OperationStatus>(initial?.status ?? "actual");
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id ?? "");
  const [sourceAccountId, setSourceAccountId] = useState(
    defaultSourceAccountId
  );
  const [targetAccountId, setTargetAccountId] = useState(
    initial?.targetAccountId ?? accounts.find((account) => account.id !== defaultSourceAccountId)?.id ?? ""
  );
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [description, setDescription] = useState(initial?.description ?? "");

  const availableCategories = useMemo(
    () => (type === "transfer" ? [] : categories.filter((c) => c.type === type)),
    [categories, type]
  );

  // Категория, выбранная сейчас, должна существовать в отфильтрованном списке.
  const effectiveCategoryId = availableCategories.some((c) => c.id === categoryId)
    ? categoryId
    : availableCategories[0]?.id ?? null;

  const numericAmount = Number(amount);
  const isTransferValid =
    sourceAccountId !== "" && targetAccountId !== "" && sourceAccountId !== targetAccountId;
  const isValid =
    date !== "" &&
    numericAmount > 0 &&
    (type === "transfer" ? isTransferValid : accountId !== "" && effectiveCategoryId !== null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid) return;
    const id = initial?.id ?? newId();
    const transferId = initial?.transferId ?? (type === "transfer" ? id : null);
    onSave({
      id,
      date,
      type,
      status,
      categoryId: type === "transfer" ? null : effectiveCategoryId,
      accountId: type === "transfer" ? sourceAccountId : accountId,
      amount: numericAmount,
      description: description.trim(),
      sourceAccountId: type === "transfer" ? sourceAccountId : null,
      targetAccountId: type === "transfer" ? targetAccountId : null,
      transferId
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{initial ? "Редактировать операцию" : "Новая операция"}</h2>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Закрыть">
            <X size={18} />
          </button>
        </header>

        <form className="op-form" onSubmit={handleSubmit}>
          <div className="op-form-grid">
            <label className="field">
              <span>Дата</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>

            <label className="field">
              <span>Тип</span>
              <select value={type} onChange={(e) => setType(e.target.value as OperationType)}>
                <option value="income">Доход</option>
                <option value="expense">Расход</option>
                <option value="transfer">Перевод</option>
              </select>
            </label>

            {type === "transfer" ? (
              <>
                <label className="field">
                  <span>Счёт-источник</span>
                  <select value={sourceAccountId} onChange={(e) => setSourceAccountId(e.target.value)}>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Счёт-получатель</span>
                  <select value={targetAccountId} onChange={(e) => setTargetAccountId(e.target.value)}>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id} disabled={account.id === sourceAccountId}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label className="field">
                  <span>Статья</span>
                  <select
                    value={effectiveCategoryId ?? ""}
                    onChange={(e) => setCategoryId(e.target.value)}
                    disabled={availableCategories.length === 0}
                  >
                    {availableCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Счёт</span>
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label className="field">
              <span>Сумма</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                required
              />
            </label>

            <label className="field">
              <span>Статус</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as OperationStatus)}>
                <option value="planned">План</option>
                <option value="actual">Факт</option>
              </select>
            </label>
          </div>

          <label className="field">
            <span>Комментарий</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Необязательно"
            />
          </label>

          <div className="modal-actions">
            {initial ? (
              <button
                type="button"
                className="danger-button"
                onClick={() => onDelete(initial.id)}
              >
                <Trash2 size={16} />
                Удалить
              </button>
            ) : (
              <span />
            )}
            <div className="modal-actions-right">
              <button type="button" className="intro-secondary" onClick={onCancel}>
                Отмена
              </button>
              <button type="submit" className="intro-submit" disabled={!isValid}>
                Сохранить
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
