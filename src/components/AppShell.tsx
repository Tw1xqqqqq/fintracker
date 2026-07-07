import { useState } from "react";
import {
  CalendarRange,
  CircleDollarSign,
  LayoutDashboard,
  ListOrdered,
  Settings
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SetupData } from "./Onboarding";
import { OperationsJournal } from "./OperationsJournal";

type SectionId = "dashboard" | "operations" | "plan" | "settings";

type NavItem = {
  id: SectionId;
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Дашборд", icon: LayoutDashboard },
  { id: "operations", label: "Операции", icon: ListOrdered },
  { id: "plan", label: "План", icon: CalendarRange },
  { id: "settings", label: "Настройки", icon: Settings }
];

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(iso));
}

type AppShellProps = {
  setup: SetupData;
  onReset: () => void;
};

export function AppShell({ setup, onReset }: AppShellProps) {
  const [active, setActive] = useState<SectionId>("dashboard");
  const current = NAV_ITEMS.find((item) => item.id === active) ?? NAV_ITEMS[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <CircleDollarSign size={26} />
          <span>FinTracker</span>
        </div>

        <nav className="nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={item.id === active ? "nav-item nav-item--active" : "nav-item"}
                onClick={() => setActive(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span className="sidebar-account">{setup.accountName}</span>
          <span className="sidebar-since">учёт с {formatDate(setup.startDate)}</span>
        </div>
      </aside>

      <main className="content">
        <header className="content-header">
          <h1>{current.label}</h1>
        </header>

        <div className="content-body">
          <Section id={active} setup={setup} onReset={onReset} />
        </div>
      </main>
    </div>
  );
}

type SectionProps = {
  id: SectionId;
  setup: SetupData;
  onReset: () => void;
};

function Section({ id, setup, onReset }: SectionProps) {
  if (id === "operations") {
    return <OperationsJournal />;
  }

  if (id === "settings") {
    return (
      <div className="panel">
        <p className="panel-lead">Параметры учёта.</p>
        <dl className="settings-list">
          <div>
            <dt>Счёт</dt>
            <dd>{setup.accountName}</dd>
          </div>
          <div>
            <dt>Начало учёта</dt>
            <dd>{formatDate(setup.startDate)}</dd>
          </div>
        </dl>
        <button className="intro-secondary" type="button" onClick={onReset}>
          Изменить данные
        </button>
      </div>
    );
  }

  const placeholders: Record<Exclude<SectionId, "settings">, string> = {
    dashboard: "Баланс по периодам и кассовые разрывы появятся здесь.",
    operations: "Журнал операций план/факт появится здесь.",
    plan: "Годовой план доходов и расходов по неделям появится здесь."
  };

  return (
    <div className="panel panel--empty">
      <p className="panel-lead">{placeholders[id]}</p>
      <span className="panel-badge">В разработке</span>
    </div>
  );
}
