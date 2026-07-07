import { ArrowRight, CircleDollarSign } from "lucide-react";
import { FormEvent, useState } from "react";

export type SetupData = {
  accountName: string;
  startDate: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type OnboardingProps = {
  onComplete: (data: SetupData) => void;
};

export function Onboarding({ onComplete }: OnboardingProps) {
  const [accountName, setAccountName] = useState("");
  const [startDate, setStartDate] = useState(todayIso);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = accountName.trim();
    if (!trimmedName) return;
    onComplete({ accountName: trimmedName, startDate });
  };

  return (
    <main className="intro-screen">
      <section className="intro-card">
        <div className="intro-brand">
          <CircleDollarSign size={32} />
          <span>FinTracker</span>
        </div>

        <h1>Добро пожаловать</h1>
        <p className="intro-lead">Укажите название счёта и дату, с которой начнёте вести учёт.</p>

        <form className="intro-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Название счёта</span>
            <input
              type="text"
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              placeholder="Например, Основная карта"
              autoFocus
              required
            />
          </label>

          <label className="field">
            <span>Дата начала учёта</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
            />
          </label>

          <button className="intro-submit" type="submit" disabled={!accountName.trim()}>
            Продолжить
            <ArrowRight size={18} />
          </button>
        </form>
      </section>
    </main>
  );
}
