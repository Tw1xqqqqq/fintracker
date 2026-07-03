import { ArrowRight, CircleDollarSign } from "lucide-react";
import { FormEvent, useState } from "react";

const STORAGE_KEY = "fintracker.setup";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(iso));
}

type SetupData = {
  accountName: string;
  startDate: string;
};

function readSetup(): SetupData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SetupData;
    if (!data.accountName || !data.startDate) return null;
    return data;
  } catch {
    return null;
  }
}

export function App() {
  const [setup, setSetup] = useState<SetupData | null>(() => readSetup());
  const [accountName, setAccountName] = useState("");
  const [startDate, setStartDate] = useState(todayIso);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = accountName.trim();
    if (!trimmedName) return;

    const nextSetup = { accountName: trimmedName, startDate };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSetup));
    setSetup(nextSetup);
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSetup(null);
    setAccountName("");
    setStartDate(todayIso());
  };

  if (setup) {
    return (
      <main className="intro-screen">
        <section className="intro-card intro-card--done">
          <div className="intro-brand">
            <CircleDollarSign size={32} />
            <span>FinTracker</span>
          </div>
          <h1>Готово</h1>
          <p className="intro-lead">
            Счёт <strong>{setup.accountName}</strong> создан. Дата начала учёта —{" "}
            <strong>{formatDate(setup.startDate)}</strong>.
          </p>
          <button className="intro-secondary" type="button" onClick={handleReset}>
            Изменить данные
          </button>
        </section>
      </main>
    );
  }

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
