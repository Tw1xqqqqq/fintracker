import { useState } from "react";
import {
  ArrowLeftRight,
  ChartColumn,
  ChartPie,
  CircleDollarSign,
  CreditCard,
  Landmark,
  PiggyBank,
  Plus,
  Scale,
  Settings
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { OperationsJournal } from "./OperationsJournal";
import { Dashboard } from "./Dashboard";
import { Plan } from "./Plan";
import { CategoriesManager } from "./CategoriesManager";
import { AccountsManager } from "./AccountsManager";
import { AccountingSettings } from "./AccountingSettings";
import { RecurringManager } from "./RecurringManager";
import { BalanceReconciliation } from "./BalanceReconciliation";

type SectionId =
  | "dashboard"
  | "operations"
  | "plan"
  | "reconciliation"
  | "card"
  | "deposit"
  | "credit"
  | "settings";

type NavItem = {
  id: SectionId;
  label: string;
  icon: LucideIcon;
};

// Группы навигации по компонентам макета (Sidebar Group Label + Sidebar Item).
const MAIN_ITEMS: NavItem[] = [
  { id: "plan", label: "Бюджет", icon: ChartColumn },
  { id: "operations", label: "Операции", icon: ArrowLeftRight },
  { id: "reconciliation", label: "Сверка", icon: Scale },
  { id: "dashboard", label: "Аналитика", icon: ChartPie }
];

const ACCOUNT_ITEMS: NavItem[] = [
  { id: "card", label: "Карта", icon: CreditCard },
  { id: "deposit", label: "Депозит", icon: PiggyBank },
  { id: "credit", label: "Кредит", icon: Landmark }
];

const TOOL_ITEMS: NavItem[] = [{ id: "settings", label: "Настройки", icon: Settings }];

const NAV_ITEMS: NavItem[] = [...MAIN_ITEMS, ...ACCOUNT_ITEMS, ...TOOL_ITEMS];

type AppShellProps = {
  onChanged: () => void;
};

export function AppShell({ onChanged }: AppShellProps) {
  const [active, setActive] = useState<SectionId>("plan");
  const current = NAV_ITEMS.find((item) => item.id === active) ?? NAV_ITEMS[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <CircleDollarSign size={20} />
          <span>Финансы</span>
        </div>

        <nav className="nav">
          <span className="nav-group-label">Основные</span>
          {MAIN_ITEMS.map((item) => (
            <NavButton key={item.id} item={item} active={active} onSelect={setActive} />
          ))}
        </nav>

        <nav className="nav nav--accounts" aria-label="Счета">
          <div className="nav-group-heading">
            <span className="nav-group-label">Счета</span>
            <button
              type="button"
              className="nav-group-action"
              aria-label="Открыть раздел карт"
              onClick={() => setActive("card")}
            >
              <Plus size={14} />
            </button>
          </div>
          {ACCOUNT_ITEMS.map((item) => (
            <NavButton key={item.id} item={item} active={active} onSelect={setActive} />
          ))}
        </nav>

        <nav className="nav nav--tools">
          <span className="nav-group-label">Инструменты</span>
          {TOOL_ITEMS.map((item) => (
            <NavButton key={item.id} item={item} active={active} onSelect={setActive} />
          ))}
        </nav>
      </aside>

      <main className="content">
        <header className="content-header">
          <h1>{current.label}</h1>
        </header>

        <div className="content-body">
          <Section id={active} onChanged={onChanged} />
        </div>
      </main>
    </div>
  );
}

type NavButtonProps = {
  item: NavItem;
  active: SectionId;
  onSelect: (id: SectionId) => void;
};

function NavButton({ item, active, onSelect }: NavButtonProps) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={item.id === active ? "nav-item nav-item--active" : "nav-item"}
      onClick={() => onSelect(item.id)}
    >
      <Icon size={16} />
      <span>{item.label}</span>
    </button>
  );
}

type SectionProps = {
  id: SectionId;
  onChanged: () => void;
};

function Section({ id, onChanged }: SectionProps) {
  if (id === "dashboard") {
    return <Dashboard />;
  }

  if (id === "operations") {
    return <OperationsJournal />;
  }

  if (id === "plan") {
    return <Plan />;
  }

  if (id === "reconciliation") {
    return <BalanceReconciliation />;
  }

  if (id === "card") {
    return (
      <AccountsManager
        filterType="card"
        title="Карты"
        description="Банковские карты и их стартовые остатки."
      />
    );
  }

  if (id === "deposit") {
    return (
      <AccountsManager
        filterType="savings"
        title="Депозиты"
        description="Накопительные и депозитные счета."
      />
    );
  }

  if (id === "credit") {
    return (
      <AccountsManager
        filterType="credit"
        title="Кредиты"
        description="Кредитные счета и кредитные карты."
      />
    );
  }

  if (id === "settings") {
    return (
      <div className="settings-stack">
        <AccountingSettings onChanged={onChanged} />
        <AccountsManager />
        <CategoriesManager />
        <RecurringManager />
      </div>
    );
  }

  return null;
}
