import { FormEvent, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Account } from "../types";

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `acc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type AccountFormProps = {
  initial: Account | null;
  defaultType?: Account["type"];
  error: string | null;
  onSave: (account: Account) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
};

export function AccountForm({ initial, defaultType, error, onSave, onDelete, onCancel }: AccountFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<Account["type"]>(initial?.type ?? defaultType ?? "card");
  const [balance, setBalance] = useState(initial ? String(initial.balance) : "0");

  const numericBalance = Number(balance);
  const isValid = name.trim() !== "" && Number.isFinite(numericBalance);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid) return;
    onSave({
      id: initial?.id ?? newId(),
      name: name.trim(),
      type,
      balance: numericBalance
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{initial ? "Редактировать счёт" : "Новый счёт"}</h2>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Закрыть">
            <X size={18} />
          </button>
        </header>

        <form className="op-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Название</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Основная карта"
              autoFocus
              required
            />
          </label>

          <div className="op-form-grid">
            <label className="field">
              <span>Тип</span>
              <select value={type} onChange={(e) => setType(e.target.value as Account["type"])}>
                <option value="cash">Наличные</option>
                <option value="card">Карта</option>
                <option value="savings">Накопления</option>
                <option value="credit">Кредит</option>
              </select>
            </label>

            <label className="field">
              <span>Баланс</span>
              <input
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0"
                required
              />
            </label>
          </div>

          {error && <p className="error-text">{error}</p>}

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
