import { FormEvent, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Account, Capitalization, Deposit } from "../types";
import { newId, todayIso } from "../lib/dates";

export const DEFAULT_CAPITALIZATION: Capitalization = "monthly";

const CAPITALIZATION_LABELS: Record<Capitalization, string> = {
  none: "Нет: проценты отдельно",
  monthly: "Ежемесячно",
  end: "В конце срока"
};

type DepositFormProps = {
  account: Account | null;
  deposit: Deposit | null;
  error: string | null;
  onSave: (account: Account, deposit: Deposit) => void;
  onDelete: (accountId: string) => void;
  onCancel: () => void;
};

// Вклад = счёт типа savings (тело вклада в балансе счёта) + условия начисления.
export function DepositForm({
  account,
  deposit,
  error,
  onSave,
  onDelete,
  onCancel
}: DepositFormProps) {
  const [name, setName] = useState(account?.name ?? "");
  const [amount, setAmount] = useState(account ? String(account.balance) : "");
  const [rate, setRate] = useState(deposit ? String(deposit.rate) : "");
  const [openDate, setOpenDate] = useState(deposit?.openDate ?? todayIso());
  const [closeDate, setCloseDate] = useState(deposit?.closeDate ?? "");
  const [capitalization, setCapitalization] = useState<Capitalization>(
    deposit?.capitalization ?? DEFAULT_CAPITALIZATION
  );
  const [planInterest, setPlanInterest] = useState(deposit?.planInterest ?? true);
  const [touched, setTouched] = useState(false);

  const nAmount = Number(amount);
  const nRate = Number(rate);

  const problems: string[] = [];
  if (name.trim() === "") problems.push("Укажите название вклада.");
  if (amount === "" || !(nAmount >= 0)) problems.push("Сумма — неотрицательное число.");
  if (rate === "" || !(nRate >= 0) || nRate > 100) problems.push("Ставка — от 0 до 100 % годовых.");
  if (openDate === "") problems.push("Укажите дату открытия.");
  if (closeDate !== "" && closeDate < openDate) {
    problems.push("Дата закрытия не может быть раньше даты открытия.");
  }
  const isValid = problems.length === 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (!isValid) return;
    const accountId = account?.id ?? newId("acc");
    onSave(
      { id: accountId, name: name.trim(), type: "savings", balance: nAmount },
      {
        accountId,
        rate: nRate,
        openDate,
        closeDate: closeDate === "" ? null : closeDate,
        capitalization,
        planInterest
      }
    );
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{account ? "Вклад" : "Новый вклад"}</h2>
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
              placeholder="Например, Вклад «Накопительный»"
              autoFocus
            />
          </label>

          <div className="op-form-grid">
            <label className="field">
              <span>Сумма на дату открытия, ₽</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Ставка, % годовых</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="0–100"
              />
            </label>
            <label className="field">
              <span>Дата открытия</span>
              <input type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Дата закрытия</span>
              <input
                type="date"
                value={closeDate}
                min={openDate}
                onChange={(e) => setCloseDate(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Капитализация</span>
              <select
                value={capitalization}
                onChange={(e) => setCapitalization(e.target.value as Capitalization)}
              >
                {(Object.keys(CAPITALIZATION_LABELS) as Capitalization[]).map((key) => (
                  <option key={key} value={key}>
                    {CAPITALIZATION_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="dep-switch">
            <input
              type="checkbox"
              checked={planInterest}
              onChange={(e) => setPlanInterest(e.target.checked)}
            />
            <span>Добавлять ожидаемые проценты в «План» как доход</span>
          </label>

          <p className="panel-lead">
            Проценты начисляются каждый день от остатка на конец дня, год берётся фактический.
            Пополнения и снятия заносятся переводами между своим счётом и вкладом. Дату закрытия
            можно не указывать — тогда вклад считается бессрочным.
          </p>

          {touched && !isValid && <p className="error-text">{problems[0]}</p>}
          {error && <p className="error-text">{error}</p>}

          <div className="modal-actions">
            {account ? (
              <button type="button" className="danger-button" onClick={() => onDelete(account.id)}>
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
              <button type="submit" className="intro-submit">
                Сохранить
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
