import { FormEvent, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Account, CreditCard } from "../types";
import { newId } from "../lib/dates";

export const DEFAULT_PAYMENT_DAYS = 20;
export const DEFAULT_BUFFER_DAYS = 3;

type CreditCardFormProps = {
  account: Account | null;
  card: CreditCard | null;
  error: string | null;
  onSave: (account: Account, card: CreditCard) => void;
  onDelete: (accountId: string) => void;
  onCancel: () => void;
};

// Кредитка = счёт типа credit (долг — отрицательный стартовый баланс) +
// настройки льготного периода по расчётному периоду.
export function CreditCardForm({ account, card, error, onSave, onDelete, onCancel }: CreditCardFormProps) {
  const [name, setName] = useState(account?.name ?? "");
  const [limit, setLimit] = useState(card ? String(card.creditLimit) : "");
  const [statementDay, setStatementDay] = useState(card ? String(card.statementDay) : "");
  const [paymentDays, setPaymentDays] = useState(String(card?.paymentDays ?? DEFAULT_PAYMENT_DAYS));
  const [bufferDays, setBufferDays] = useState(String(card?.repayBufferDays ?? DEFAULT_BUFFER_DAYS));
  const [startDebt, setStartDebt] = useState(account ? String(Math.max(0, -account.balance)) : "0");

  const nLimit = Number(limit);
  const nDay = Number(statementDay);
  const nPayment = Number(paymentDays);
  const nBuffer = Number(bufferDays);
  const nDebt = Number(startDebt);

  const problems: string[] = [];
  if (name.trim() === "") problems.push("Укажите название карты.");
  if (!(nLimit >= 0) || limit === "") problems.push("Лимит — неотрицательное число.");
  if (!Number.isInteger(nDay) || nDay < 1 || nDay > 31) problems.push("День выписки — от 1 до 31.");
  if (!Number.isInteger(nPayment) || nPayment < 1 || nPayment > 60) {
    problems.push("Платёжный период — от 1 до 60 дней.");
  }
  if (!Number.isInteger(nBuffer) || nBuffer < 0 || nBuffer >= nPayment) {
    problems.push("Буфер — от 0 дней и меньше платёжного периода.");
  }
  if (!(nDebt >= 0)) problems.push("Долг — неотрицательное число.");
  const isValid = problems.length === 0;
  const [touched, setTouched] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (!isValid) return;
    const accountId = account?.id ?? newId("acc");
    onSave(
      { id: accountId, name: name.trim(), type: "credit", balance: nDebt === 0 ? 0 : -nDebt },
      {
        accountId,
        creditLimit: nLimit,
        statementDay: nDay,
        paymentDays: nPayment,
        repayBufferDays: nBuffer
      }
    );
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{account ? "Кредитка" : "Новая кредитка"}</h2>
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
              placeholder="Например, Альфа 100 дней"
              autoFocus
            />
          </label>

          <div className="op-form-grid">
            <label className="field">
              <span>Кредитный лимит, ₽</span>
              <input type="number" min="0" step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} />
            </label>
            <label className="field">
              <span>Долг на начало учёта, ₽</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={startDebt}
                onChange={(e) => setStartDebt(e.target.value)}
              />
            </label>
            <label className="field">
              <span>День выписки (число месяца)</span>
              <input
                type="number"
                min="1"
                max="31"
                value={statementDay}
                onChange={(e) => setStatementDay(e.target.value)}
                placeholder="1–31"
              />
            </label>
            <label className="field">
              <span>Платёжный период, дней</span>
              <input
                type="number"
                min="1"
                max="60"
                value={paymentDays}
                onChange={(e) => setPaymentDays(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Планировать погашение за, дней</span>
              <input
                type="number"
                min="0"
                value={bufferDays}
                onChange={(e) => setBufferDays(e.target.value)}
              />
            </label>
          </div>

          <p className="panel-lead">
            Покупки до дня выписки включительно попадают в выписку. Долг по выписке нужно погасить
            за платёжный период — тогда проценты не начисляются.
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
