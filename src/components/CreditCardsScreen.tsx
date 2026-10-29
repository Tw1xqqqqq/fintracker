import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Account, CreditCard, Operation } from "../types";
import type { CreditCardState, CreditStatus } from "../lib/credit";
import { creditCardState } from "../lib/credit";
import { formatMoney } from "../lib/finance";
import { shortDate, todayIso } from "../lib/dates";
import { deleteBlockedMessage, errorText } from "../lib/usage";
import {
  accountUsage,
  deleteAccount,
  deleteCreditCard,
  getSetting,
  listAccounts,
  listCreditCards,
  listOperations,
  upsertAccount,
  upsertCreditCard
} from "../lib/repository";
import { CreditCardForm, DEFAULT_BUFFER_DAYS, DEFAULT_PAYMENT_DAYS } from "./CreditCardForm";

const STATUS_LABELS: Record<CreditStatus, string> = {
  clear: "Нет долга",
  period: "Идёт период",
  due: "К оплате",
  soon: "Скоро платёж",
  overdue: "Просрочено"
};

function daysWord(count: number): string {
  const n = Math.abs(count);
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

function dueHint(state: CreditCardState): string {
  if (state.daysLeft === null) return "";
  if (state.daysLeft < 0) return `просрочено на ${-state.daysLeft} ${daysWord(state.daysLeft)}`;
  if (state.daysLeft === 0) return "сегодня последний день";
  return `через ${state.daysLeft} ${daysWord(state.daysLeft)}`;
}

type Row = { account: Account; card: CreditCard; configured: boolean; state: CreditCardState };

export function CreditCardsScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [since, setSince] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const today = todayIso();

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [accs, cardList, ops, startDate] = await Promise.all([
        listAccounts(),
        listCreditCards(),
        listOperations(),
        getSetting("startDate")
      ]);
      setAccounts(accs);
      setCards(cardList);
      setOperations(ops);
      setSince(startDate ?? "");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const rows: Row[] = useMemo(() => {
    const from = since || "2000-01-01";
    return accounts
      .filter((account) => account.type === "credit")
      .map((account) => {
        const saved = cards.find((card) => card.accountId === account.id);
        const card: CreditCard = saved ?? {
          accountId: account.id,
          creditLimit: 0,
          statementDay: 1,
          paymentDays: DEFAULT_PAYMENT_DAYS,
          repayBufferDays: DEFAULT_BUFFER_DAYS
        };
        const state = creditCardState(card, Math.max(0, -account.balance), operations, from, today);
        return { account, card, configured: Boolean(saved), state };
      });
  }, [accounts, cards, operations, since, today]);

  const totalDebt = rows.reduce((sum, row) => sum + row.state.debt, 0);
  const toPay = rows.reduce((sum, row) => sum + (row.state.nextDue?.remaining ?? 0), 0);
  const nearest = rows
    .map((row) => row.state.nextDue)
    .filter((due): due is NonNullable<typeof due> => due !== null)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];

  const openNew = () => {
    setEditing(null);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditing(row);
    setFormError(null);
    setFormOpen(true);
  };

  const handleSave = async (account: Account, card: CreditCard) => {
    try {
      await upsertAccount(account);
      await upsertCreditCard(card);
      setFormOpen(false);
      await reload();
    } catch (err) {
      setFormError(errorText(err));
    }
  };

  const handleDelete = async (accountId: string) => {
    try {
      const blocked = deleteBlockedMessage("Счёт", await accountUsage(accountId));
      if (blocked) {
        setFormError(blocked);
        return;
      }
      await deleteCreditCard(accountId);
      await deleteAccount(accountId);
      setFormOpen(false);
      await reload();
    } catch (err) {
      setFormError(errorText(err));
    }
  };

  return (
    <div className="cc-page">
      <div className="panel cc-summary">
        <div className="cc-summary-item">
          <span className="cc-summary-label">Общий долг</span>
          <span className={totalDebt > 0 ? "cc-summary-value amount--expense" : "cc-summary-value"}>
            {formatMoney(totalDebt)}
          </span>
        </div>
        <div className="cc-summary-item">
          <span className="cc-summary-label">К погашению по выпискам</span>
          <span className="cc-summary-value">{formatMoney(toPay)}</span>
        </div>
        <div className="cc-summary-item">
          <span className="cc-summary-label">Ближайший платёж</span>
          <span className="cc-summary-value">{nearest ? `до ${shortDate(nearest.dueDate)}` : "—"}</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Кредитки</h2>
            <p className="panel-lead">
              Долг по каждой карте и последний день без процентов по выписке.
            </p>
          </div>
          {!error && (
            <button type="button" className="intro-submit" onClick={openNew}>
              <Plus size={16} />
              Добавить кредитку
            </button>
          )}
        </div>

        {loading ? (
          <p className="panel-lead">Загрузка…</p>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : rows.length === 0 ? (
          <p className="cat-empty">Кредиток пока нет — добавьте первую.</p>
        ) : (
          <ul className="acc-list">
            {rows.map((row) => {
              const { account, card, configured, state } = row;
              const used = card.creditLimit > 0 ? Math.min(1, state.debt / card.creditLimit) : 0;
              return (
                <li key={account.id}>
                  <button type="button" className="acc-item cc-item" onClick={() => openEdit(row)}>
                    <span className="cc-head">
                      <span className="acc-name">{account.name}</span>
                      <span className={`cc-status cc-status--${state.status}`}>
                        {STATUS_LABELS[state.status]}
                      </span>
                    </span>

                    <span className="cc-numbers">
                      <span>
                        Долг <strong>{formatMoney(state.debt)}</strong>
                      </span>
                      {card.creditLimit > 0 && (
                        <span className="cc-muted">
                          из {formatMoney(card.creditLimit)} · доступно {formatMoney(state.available)}
                        </span>
                      )}
                    </span>
                    {card.creditLimit > 0 && (
                      <span className="cc-bar" aria-hidden="true">
                        <span className="cc-bar-fill" style={{ width: `${Math.round(used * 100)}%` }} />
                      </span>
                    )}

                    {!configured ? (
                      <span className="cc-line cc-warn">
                        Укажите день выписки и платёжный период, чтобы считать льготный период.
                      </span>
                    ) : (
                      <>
                        {state.nextDue && (
                          <span className="cc-line">
                            Выписка {shortDate(state.nextDue.statementDate)}: к оплате{" "}
                            <strong>{formatMoney(state.nextDue.remaining)}</strong> до{" "}
                            <strong>{shortDate(state.nextDue.dueDate)}</strong> ({dueHint(state)}) ·
                            погасить лучше до {shortDate(state.nextDue.payBy)}
                          </span>
                        )}
                        <span className="cc-line cc-muted">
                          Текущий период {shortDate(state.currentPeriod.start)}–
                          {shortDate(state.currentPeriod.statementDate)}: потрачено{" "}
                          {formatMoney(state.currentPeriod.spent)}
                        </span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {formOpen && (
        <CreditCardForm
          account={editing?.account ?? null}
          card={editing?.configured ? editing.card : null}
          error={formError}
          onSave={handleSave}
          onDelete={handleDelete}
          onCancel={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
