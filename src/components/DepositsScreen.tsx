import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Account, Deposit, Operation } from "../types";
import type { DepositForecast } from "../lib/deposit";
import { depositForecast } from "../lib/deposit";
import { formatMoney } from "../lib/finance";
import { shortDate, todayIso } from "../lib/dates";
import { deleteBlockedMessage, errorText } from "../lib/usage";
import {
  accountUsage,
  deleteAccount,
  deleteDeposit,
  listAccounts,
  listDeposits,
  listOperations,
  upsertAccount,
  upsertDeposit
} from "../lib/repository";
import { DepositForm, DEFAULT_CAPITALIZATION } from "./DepositForm";
import { computeAccountBalances } from "../lib/finance";

const CAPITALIZATION_SHORT: Record<Deposit["capitalization"], string> = {
  none: "без капитализации",
  monthly: "капитализация ежемесячно",
  end: "капитализация в конце срока"
};

// Расчёт процентов приблизительный: банк может считать по своим правилам
// округления, поэтому суммы помечаются «≈».
const APPROX_HINT = "Расчёт примерный: банк может округлять иначе";

type Row = {
  account: Account;
  deposit: Deposit;
  configured: boolean;
  balance: number;
  forecast: DepositForecast;
};

export function DepositsScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
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
      const [accs, depositList, ops] = await Promise.all([
        listAccounts(),
        listDeposits(),
        listOperations()
      ]);
      setAccounts(accs);
      setDeposits(depositList);
      setOperations(ops);
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
    const balances = new Map(
      computeAccountBalances(accounts, operations, today).map((item) => [item.account.id, item.balance])
    );
    return accounts
      .filter((account) => account.type === "savings")
      .map((account) => {
        const saved = deposits.find((item) => item.accountId === account.id);
        const deposit: Deposit =
          saved ?? {
            accountId: account.id,
            rate: 0,
            openDate: today,
            closeDate: null,
            capitalization: DEFAULT_CAPITALIZATION,
            planInterest: false
          };
        return {
          account,
          deposit,
          configured: Boolean(saved),
          balance: balances.get(account.id) ?? account.balance,
          forecast: depositForecast(deposit, account.balance, operations, today)
        };
      });
  }, [accounts, deposits, operations, today]);

  const totalBalance = rows.reduce((sum, row) => sum + row.balance, 0);
  const totalThisMonth = rows.reduce((sum, row) => sum + row.forecast.accruedThisMonth, 0);
  const nearestClose = rows
    .map((row) => row.deposit.closeDate)
    .filter((date): date is string => date !== null && date >= today)
    .sort()[0];

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

  const handleSave = async (account: Account, deposit: Deposit) => {
    try {
      await upsertAccount(account);
      await upsertDeposit(deposit);
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
      await deleteDeposit(accountId);
      await deleteAccount(accountId);
      setFormOpen(false);
      await reload();
    } catch (err) {
      setFormError(errorText(err));
    }
  };

  const approx = (value: number) => `≈ ${formatMoney(value)}`;

  return (
    <div className="cc-page">
      <div className="panel cc-summary">
        <div className="cc-summary-item">
          <span className="cc-summary-label">Всего на вкладах</span>
          <span className="cc-summary-value">{formatMoney(totalBalance)}</span>
        </div>
        <div className="cc-summary-item">
          <span className="cc-summary-label">Начислено за месяц</span>
          <span className="cc-summary-value amount--income" title={APPROX_HINT}>
            {approx(totalThisMonth)}
          </span>
        </div>
        <div className="cc-summary-item">
          <span className="cc-summary-label">Ближайшее закрытие</span>
          <span className="cc-summary-value">{nearestClose ? shortDate(nearestClose) : "—"}</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Депозиты</h2>
            <p className="panel-lead">
              Остаток, ставка и начисленные проценты по каждому вкладу. Суммы процентов помечены
              «≈»: расчёт примерный.
            </p>
          </div>
          {!error && (
            <button type="button" className="intro-submit" onClick={openNew}>
              <Plus size={16} />
              Добавить вклад
            </button>
          )}
        </div>

        {loading ? (
          <p className="panel-lead">Загрузка…</p>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : rows.length === 0 ? (
          <p className="cat-empty">Вкладов пока нет — добавьте первый.</p>
        ) : (
          <ul className="acc-list">
            {rows.map((row) => {
              const { account, deposit, configured, balance, forecast } = row;
              return (
                <li key={account.id}>
                  <button type="button" className="acc-item cc-item" onClick={() => openEdit(row)}>
                    <span className="cc-head">
                      <span className="acc-name">{account.name}</span>
                      <span
                        className={`cc-status cc-status--${forecast.isClosed ? "clear" : "period"}`}
                      >
                        {forecast.isClosed ? "Срок истёк" : configured ? "Открыт" : "Без условий"}
                      </span>
                    </span>

                    <span className="cc-numbers">
                      <span>
                        Остаток <strong>{formatMoney(balance)}</strong>
                      </span>
                      {configured && (
                        <span className="cc-muted">
                          {deposit.rate}% годовых · {CAPITALIZATION_SHORT[deposit.capitalization]}
                        </span>
                      )}
                    </span>

                    {!configured ? (
                      <span className="cc-line cc-warn">
                        Укажите ставку и даты, чтобы считать проценты.
                      </span>
                    ) : (
                      <>
                        <span className="cc-line" title={APPROX_HINT}>
                          Начислено с открытия <strong>{approx(forecast.accruedToDate)}</strong> · за
                          текущий месяц <strong>{approx(forecast.accruedThisMonth)}</strong>
                        </span>
                        <span className="cc-line cc-muted" title={APPROX_HINT}>
                          {deposit.closeDate ? (
                            <>
                              К закрытию {shortDate(deposit.closeDate)}:{" "}
                              {forecast.accruedToClose === null
                                ? "—"
                                : approx(forecast.accruedToClose)}{" "}
                              процентов, остаток{" "}
                              {forecast.closeBalance === null
                                ? "—"
                                : approx(forecast.closeBalance)}
                            </>
                          ) : (
                            <>Вклад без срока: дата закрытия не указана</>
                          )}
                        </span>
                        {deposit.planInterest && (
                          <span className="cc-line cc-muted">
                            Ожидаемые проценты попадают в «План» как доход
                          </span>
                        )}
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
        <DepositForm
          account={editing?.account ?? null}
          deposit={editing?.configured ? editing.deposit : null}
          error={formError}
          onSave={handleSave}
          onDelete={handleDelete}
          onCancel={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
