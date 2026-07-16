import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Category } from "../types";
import {
  countOperationsForCategory,
  deleteCategory,
  listCategories,
  upsertCategory
} from "../lib/repository";
import { CategoryForm } from "./CategoryForm";

export function CategoriesManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setCategories(await listCategories());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const income = useMemo(() => categories.filter((c) => c.type === "income"), [categories]);
  const expense = useMemo(() => categories.filter((c) => c.type === "expense"), [categories]);

  const openNew = () => {
    setEditing(null);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditing(category);
    setFormError(null);
    setFormOpen(true);
  };

  const handleSave = async (category: Category) => {
    await upsertCategory(category);
    setFormOpen(false);
    await reload();
  };

  const handleDelete = async (id: string) => {
    const used = await countOperationsForCategory(id);
    if (used > 0) {
      setFormError(`Статья используется в ${used} операц. — удаление недоступно.`);
      return;
    }
    await deleteCategory(id);
    setFormOpen(false);
    await reload();
  };

  const renderGroup = (title: string, items: Category[]) => (
    <div className="cat-group">
      <h3 className="cat-group-title">{title}</h3>
      {items.length === 0 ? (
        <p className="cat-empty">Пока нет статей.</p>
      ) : (
        <ul className="cat-list">
          {items.map((category) => (
            <li key={category.id}>
              <button type="button" className="cat-item" onClick={() => openEdit(category)}>
                <span className="cat-swatch" style={{ background: category.color }} />
                <span className="cat-name">{category.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Статьи доходов и расходов</h2>
          <p className="panel-lead">Справочник статей для планирования и операций.</p>
        </div>
        {!error && (
          <button type="button" className="intro-submit" onClick={openNew}>
            <Plus size={16} />
            Добавить статью
          </button>
        )}
      </div>

      {loading ? (
        <p className="panel-lead">Загрузка статей…</p>
      ) : error ? (
        <>
          <p className="error-text">{error}</p>
          <p className="panel-lead">
            Справочники доступны только в десктоп-приложении (SQLite). Запустите его через
            <code> npm run tauri dev</code>.
          </p>
        </>
      ) : (
        <div className="cat-groups">
          {renderGroup("Доходы", income)}
          {renderGroup("Расходы", expense)}
        </div>
      )}

      {formOpen && (
        <CategoryForm
          initial={editing}
          error={formError}
          onSave={handleSave}
          onDelete={handleDelete}
          onCancel={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
