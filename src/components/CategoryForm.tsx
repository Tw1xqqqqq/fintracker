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
  error: string | null;
  onSave: (category: Category) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
};

export function CategoryForm({ initial, error, onSave, onDelete, onCancel }: CategoryFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<Category["type"]>(initial?.type ?? "expense");
  const [color, setColor] = useState(initial?.color ?? "#1c7ed6");

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
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{initial ? "Редактировать статью" : "Новая статья"}</h2>
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
              placeholder="Например, Продукты"
              autoFocus
              required
            />
          </label>

          <div className="op-form-grid">
            <label className="field">
              <span>Тип</span>
              <select value={type} onChange={(e) => setType(e.target.value as Category["type"])}>
                <option value="income">Доход</option>
                <option value="expense">Расход</option>
              </select>
            </label>

            <label className="field">
              <span>Цвет</span>
              <input
                type="color"
                className="color-input"
                value={color}
                onChange={(e) => setColor(e.target.value)}
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
