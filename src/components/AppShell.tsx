import { useState } from "react";
import {
  CalendarRange,
  CircleDollarSign,
  LayoutDashboard,
  ListOrdered,
  Settings
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppState } from "../App";
import { OperationsJournal } from "./OperationsJournal";
import { CategoriesManager } from "./CategoriesManager";
import { AccountsManager } from "./AccountsManager";
import { AccountingSettings } from "./AccountingSettings";

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
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(parsed);
}

type AppShellProps = {
  appState: AppState;
  onChanged: () => void;
};

export function AppShell({ appState, onChanged }: AppShellProps) {
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
          <span className="sidebar-account">{appState.accountName}</span>
          <span className="sidebar-since">учёт с {formatDate(appState.startDate)}</span>
        </div>
      </aside>

      <main className="content">
        <header className="content-header">
          <h1>{current.label}</h1>
        </header>

        <div className="content-body">
          <Section id={active} appState={appState} onChanged={onChanged} />
        </div>
      </main>
    </div>
  );
}

type SectionProps = {
  id: SectionId;
  appState: AppState;
  onChanged: () => void;
};

function Section({ id, onChanged }: SectionProps) {
  if (id === "operations") {
    return <OperationsJournal />;
  }

  if (id === "settings") {
    return (
      <div className="settings-stack">
        <AccountingSettings onChanged={onChanged} />
        <AccountsManager />
        <CategoriesManager />
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
