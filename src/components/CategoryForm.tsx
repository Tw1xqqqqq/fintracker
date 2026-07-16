import { FormEvent, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Category } from "../types";

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `cat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type CategoryFormProps = {
  initial: Category | null;
  defaultType?: Category["type"];
  error: string | null;
  onSave: (category: Category) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
};

export function CategoryForm({
  initial,
  defaultType,
  error,
  onSave,
  onDelete,
  onCancel
}: CategoryFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<Category["type"]>(initial?.type ?? defaultType ?? "expense");
  const color = initial?.color ?? "#171717";

  const isValid = name.trim() !== "";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid) return;
    onSave({
      id: initial?.id ?? newId(),
      name: name.trim(),
      type,
      color
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal modal--category"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="category-modal-header">
          <h2 id="category-dialog-title">
            {initial ? "Редактирование категории" : "Создание категории"}
          </h2>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Закрыть">
            <X size={14} />
          </button>
        </header>

        <form className="category-form" onSubmit={handleSubmit}>
          <div className="category-type-switch">
            <button
              type="button"
              className={
                type === "expense"
                  ? "category-type-option category-type-option--active"
                  : "category-type-option"
              }
              aria-pressed={type === "expense"}
              onClick={() => setType("expense")}
            >
              Расход
            </button>
            <button
              type="button"
              className={
                type === "income"
                  ? "category-type-option category-type-option--active"
                  : "category-type-option"
              }
              aria-pressed={type === "income"}
              onClick={() => setType("income")}
            >
              Доход
            </button>
          </div>

          <label className="field category-field">
            <span>Название категории</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: подписки"
              autoFocus
              required
            />
          </label>

          {error && <p className="error-text">{error}</p>}

          <div className="category-modal-actions">
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
                {initial ? "Сохранить" : "Создать"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
