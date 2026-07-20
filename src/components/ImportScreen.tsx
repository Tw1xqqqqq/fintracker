import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { CircleCheck, FileUp, Upload } from "lucide-react";
import type { Account, Category } from "../types";
import type { ColumnMapping, ImportRow } from "../lib/csvImport";
import { buildImportRows, decodeCsvBuffer, guessColumns, parseCsv } from "../lib/csvImport";
import { formatMoney } from "../lib/finance";
import { getSetting, listAccounts, listCategories, upsertOperation } from "../lib/repository";

function shortDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : iso;
}

type EditableRow = ImportRow & { checked: boolean };

const FIELD_LABELS: { key: keyof Pick<ColumnMapping, "date" | "amount" | "description">; label: string }[] = [
  { key: "date", label: "Дата" },
  { key: "amount", label: "Сумма" },
  { key: "description", label: "Описание" }
];

export function ImportScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [saving, setSaving] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [accs, cats, primaryId] = await Promise.all([
          listAccounts(),
          listCategories(),
          getSetting("primaryAccountId")
        ]);
        setAccounts(accs);
        setCategories(cats);
        setAccountId(accs.find((a) => a.id === primaryId)?.id ?? accs[0]?.id ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const columnCount = useMemo(
    () => rawRows.reduce((max, row) => Math.max(max, row.length), 0),
    [rawRows]
  );
  const previewRows = useMemo(() => rawRows.slice(0, 5), [rawRows]);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportedCount(null);
    setRows([]);
    setSkipped(0);
    try {
      const text = decodeCsvBuffer(await file.arrayBuffer());
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setError("Файл пустой или не похож на CSV.");
        return;
      }
      setError(null);
      setFileName(file.name);
      setRawRows(parsed);
      setMapping(guessColumns(parsed));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const recognize = () => {
    if (!mapping) return;
    const { rows: built, skipped: skippedCount } = buildImportRows(rawRows, mapping, categories);
    setRows(built.map((row) => ({ ...row, checked: row.categoryId !== null })));
    setSkipped(skippedCount);
    setImportedCount(null);
  };

  const updateRow = (key: string, patch: Partial<EditableRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const ready = rows.filter((row) => row.checked && row.categoryId !== null);
  const readyIncome = ready.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const readyExpense = ready.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);

  const handleImport = async () => {
    if (ready.length === 0 || accountId === "") return;
    setSaving(true);
    setError(null);
    try {
      for (const row of ready) {
        await upsertOperation({
          id: row.key,
          date: row.date,
          type: row.type,
          status: "actual",
          categoryId: row.categoryId,
          accountId,
          amount: row.amount,
          description: row.description
        });
      }
      setImportedCount(ready.length);
      setRows([]);
      setRawRows([]);
      setMapping(null);
      setFileName(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="panel panel--empty">Загрузка…</div>;
  }

  if (error && accounts.length === 0) {
    return (
      <div className="panel">
        <p className="panel-lead">Не удалось загрузить данные для импорта.</p>
        <p className="error-text">{error}</p>
        <p className="panel-lead">
          Импорт доступен только в десктоп-приложении (SQLite). Запустите его через
          <code> npm run tauri dev</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="panel budget-panel">
      <div className="budget-toolbar">
        <div className="budget-toolbar-left">
          <span className="budget-title">Импорт банковской выписки</span>
          {fileName && <span className="budget-range">{fileName}</span>}
        </div>
        <div className="budget-toolbar-right">
          <select
            className="budget-granularity"
            aria-label="Счёт для импорта"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <label className="intro-secondary import-file-button">
            <Upload size={16} />
            Выбрать CSV-файл
            <input type="file" accept=".csv,text/csv" onChange={(event) => void handleFile(event)} hidden />
          </label>
        </div>
      </div>

      <div className="import-body">
        {error && <p className="error-text">{error}</p>}

        {importedCount !== null && (
          <p className="import-success">
            <CircleCheck size={16} />
            Импортировано операций: {importedCount}. Они уже в журнале и учтены в балансе.
          </p>
        )}

        {rawRows.length === 0 && importedCount === null && (
          <div className="import-empty">
            <FileUp size={28} />
            <p className="panel-lead">
              Выберите CSV-файл выписки — поддерживаются разделители «;» и «,», кодировки UTF-8 и
              Windows-1251.
            </p>
          </div>
        )}

        {rawRows.length > 0 && mapping && (
          <>
            <div className="import-mapping">
              {FIELD_LABELS.map(({ key, label }) => (
                <label key={key} className="field">
                  <span>{label}</span>
                  <select
                    value={mapping[key]}
                    onChange={(event) =>
                      setMapping({ ...mapping, [key]: Number(event.target.value) })
                    }
                  >
                    {Array.from({ length: columnCount }, (_, index) => (
                      <option key={index} value={index}>
                        Колонка {index + 1}
                        {mapping.hasHeader && rawRows[0][index] ? ` — ${rawRows[0][index]}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="field import-header-toggle">
                <span>Первая строка</span>
                <select
                  value={mapping.hasHeader ? "header" : "data"}
                  onChange={(event) =>
                    setMapping({ ...mapping, hasHeader: event.target.value === "header" })
                  }
                >
                  <option value="header">Заголовок</option>
                  <option value="data">Данные</option>
                </select>
              </label>
              <button type="button" className="intro-submit import-recognize" onClick={recognize}>
                Распознать операции
              </button>
            </div>

            <div className="budget-table-wrap">
              <table className="data-table import-preview">
                <tbody>
                  {previewRows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {Array.from({ length: columnCount }, (_, col) => (
                        <td key={col} className={rowIndex === 0 && mapping.hasHeader ? "import-preview-header" : ""}>
                          {row[col] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {rows.length > 0 && (
          <>
            <div className="budget-table-wrap">
              <table className="data-table import-confirm">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Выбрать все"
                        checked={rows.every((row) => row.checked)}
                        onChange={(event) =>
                          setRows((prev) => prev.map((row) => ({ ...row, checked: event.target.checked })))
                        }
                      />
                    </th>
                    <th>Дата</th>
                    <th>Описание</th>
                    <th>Статья</th>
                    <th>Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className={row.checked ? "" : "import-row--off"}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label="Импортировать строку"
                          checked={row.checked}
                          onChange={(event) => updateRow(row.key, { checked: event.target.checked })}
                        />
                      </td>
                      <td>{shortDate(row.date)}</td>
                      <td className="import-desc">{row.description || "—"}</td>
                      <td>
                        <select
                          className="import-category"
                          value={row.categoryId ?? ""}
                          onChange={(event) =>
                            updateRow(row.key, { categoryId: event.target.value || null })
                          }
                        >
                          <option value="">— не выбрана —</option>
                          {categories
                            .filter((category) => category.type === row.type)
                            .map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td>
                        <span className={`amount amount--${row.type}`}>
                          {row.type === "expense" ? "−" : "+"}
                          {formatMoney(row.amount)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="import-footer">
              <span className="import-summary">
                Выбрано {ready.length} из {rows.length}
                {skipped > 0 && ` · нераспознанных строк: ${skipped}`} · доход{" "}
                <span className="amount amount--income">+{formatMoney(readyIncome)}</span> · расход{" "}
                <span className="amount amount--expense">−{formatMoney(readyExpense)}</span>
              </span>
              <button
                type="button"
                className="intro-submit"
                disabled={ready.length === 0 || saving || accountId === ""}
                onClick={() => void handleImport()}
              >
                {saving ? "Импорт…" : `Импортировать ${ready.length}`}
              </button>
            </div>
            {rows.some((row) => row.checked && row.categoryId === null) && (
              <p className="import-hint">
                Отмеченные строки без статьи не импортируются — выберите статью или снимите галочку.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
