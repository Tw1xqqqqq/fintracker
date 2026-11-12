import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import type { Account, Operation } from "../types";
import type { CreditCardState } from "../lib/credit";
import { repaymentDraft } from "../lib/credit";
import { accountsInGroup } from "../lib/accounts";
import { formatMoney } from "../lib/finance";
import { newId, shortDate, todayIso } from "../lib/dates";

type RepayCardDialogProps = {
  account: Account; // счёт кредитки
  accounts: Account[]; // все счета — из них выбирается источник
  state: CreditCardState;
  primaryAccountId: string | null;
  error: string | null;
  onSave: (operation: Operation) => void;
  onCancel: () => void;
};

// Погашение кредитки — это перевод «свой счёт → карта» (CC-6). Диалог только
// собирает операцию: суммы и даты считает repaymentDraft в lib/credit.ts.
export function RepayCardDialog({
  account,
  accounts,
  state,
  primaryAccountId,
  error,
  onSave,
  onCancel
}: RepayCardDialogProps) {
  const today = todayIso();
  const sources = accountsInGroup(accounts, "liquid");
  const initial = repaymentDraft(state, today, "actual");

  const [status, setStatus] = useState<Operation["status"]>("actual");
  const [amount, setAmount] = useState(initial.amount > 0 ? String(initial.amount) : "");
  const [date, setDate] = useState(initial.date);
  const [sourceId, setSourceId] = useState(
    sources.find((item) => item.id === primaryAccountId)?.id ?? sources[0]?.id ?? ""
  );
  const [touched, setTouched] = useState(false);

  // Смена статуса переставляет дату на подсказанную: факт — сегодня,
  // план — за буфер до даты платежа. Введённую вручную сумму не трогаем.
  const handleStatus = (next: Operation["status"]) => {
    setStatus(next);
    setDate(repaymentDraft(state, today, next === "planned" ? "planned" : "actual").date);
  };

  const nAmount = Number(amount);
  const source = sources.find((item) => item.id === sourceId) ?? null;

  const problems: string[] = [];
  if (sources.length === 0) {
    problems.push("Нет счёта, с которого можно списать: заведите наличные или дебетовую карту.");
  }
  if (!source) problems.push("Выберите счёт списания.");
  if (amount === "" || !(nAmount > 0)) problems.push("Сумма погашения — положительное число.");
  if (date === "") problems.push("Укажите дату.");
  const isValid = problems.length === 0;

  const overpay = source !== null && nAmount > state.debt && state.debt > 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (!isValid || !source) return;
    const transferId = newId("op");
    onSave({
      id: transferId,
      date,
      type: "transfer",
      status,
      categoryId: null,
      accountId: source.id,
      amount: nAmount,
      description: initial.statementDate
        ? `Погашение выписки от ${shortDate(initial.statementDate)}`
        : "Погашение кредитки",
      sourceAccountId: source.id,
      targetAccountId: account.id,
      transferId
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>Погашение выписки</h2>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Закрыть">
            <X size={18} />
          </button>
        </header>

        <form className="op-form" onSubmit={handleSubmit}>
          <div className="repay-recap">
            <div className="repay-recap-row">
              <span className="cc-muted">Карта</span>
              <strong>{account.name}</strong>
            </div>
            {initial.statementDate && initial.dueDate ? (
              <>
                <div className="repay-recap-row">
                  <span className="cc-muted">Выписка</span>
                  <strong>{shortDate(initial.statementDate)}</strong>
                </div>
                <div className="repay-recap-row">
                  <span className="cc-muted">Последний день без процентов</span>
                  <strong>{shortDate(initial.dueDate)}</strong>
                </div>
              </>
            ) : (
              <div className="repay-recap-row">
                <span className="cc-muted">Текущий долг</span>
                <strong>{formatMoney(state.debt)}</strong>
              </div>
            )}
          </div>

          <label className="field">
            <span>Сумма, ₽</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </label>
          <p className="field-note">
            {initial.target === "statement"
              ? "Вся задолженность по выписке. Можно внести меньше — остаток перейдёт на следующий период с процентами."
              : "Весь текущий долг по карте."}
          </p>

          <div className="op-form-grid">
            <label className="field">
              <span>Списать со счёта</span>
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                {sources.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Дата</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Статус</span>
              <select
                value={status}
                onChange={(e) => handleStatus(e.target.value as Operation["status"])}
              >
                <option value="actual">Факт — уже оплачено</option>
                <option value="planned">План — перевод появится в «Бюджете»</option>
              </select>
            </label>
          </div>
          <p className="field-note">
            Дата для плана подставляется за {initial.statementDate ? "буфер" : "несколько дней"} до
            даты платежа. Буфер меняется в настройках карты.
          </p>

          {overpay && (
            <p className="cc-line cc-warn">
              Сумма больше текущего долга {formatMoney(state.debt)} — на карте появится переплата.
            </p>
          )}
          {touched && !isValid && <p className="error-text">{problems[0]}</p>}
          {error && <p className="error-text">{error}</p>}

          <div className="modal-actions">
            <span />
            <div className="modal-actions-right">
              <button type="button" className="intro-secondary" onClick={onCancel}>
                Отмена
              </button>
              <button type="submit" className="intro-submit">
                {status === "planned" ? "Запланировать погашение" : "Отметить погашение"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
