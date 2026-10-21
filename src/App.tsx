import { useEffect, useState } from "react";
import { Onboarding } from "./components/Onboarding";
import { AppShell } from "./components/AppShell";
import type { SetupData } from "./components/Onboarding";
import {
  getSetting,
  listAccounts,
  seedDefaultCategories,
  setSetting,
  upsertAccount
} from "./lib/repository";
import { newId } from "./lib/dates";

export type AppState = {
  accountName: string;
  startDate: string;
};

type Status =
  | { kind: "loading" }
  | { kind: "onboarding" }
  | { kind: "ready"; state: AppState }
  | { kind: "error"; message: string };

export function App() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  async function load() {
    try {
      const accounts = await listAccounts();
      if (accounts.length === 0) {
        setStatus({ kind: "onboarding" });
        return;
      }
      const startDate = (await getSetting("startDate")) ?? "";
      const primaryId = await getSetting("primaryAccountId");
      const primary = accounts.find((account) => account.id === primaryId) ?? accounts[0];
      setStatus({ kind: "ready", state: { accountName: primary.name, startDate } });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const handleComplete = async (data: SetupData) => {
    const id = newId("acc");
    await upsertAccount({ id, name: data.accountName, type: "card", balance: 0 });
    await setSetting("primaryAccountId", id);
    await setSetting("startDate", data.startDate);
    await seedDefaultCategories();
    await load();
  };

  if (status.kind === "loading") {
    return (
      <main className="intro-screen">
        <section className="intro-card">
          <p className="intro-lead">Загрузка…</p>
        </section>
      </main>
    );
  }

  if (status.kind === "error") {
    return (
      <main className="intro-screen">
        <section className="intro-card">
          <h1>Не удалось открыть базу данных</h1>
          <p className="error-text">{status.message}</p>
          <p className="intro-lead">
            Приложение работает с локальной базой (SQLite) и запускается через
            <code> npm run tauri dev</code>.
          </p>
        </section>
      </main>
    );
  }

  if (status.kind === "onboarding") {
    return <Onboarding onComplete={handleComplete} />;
  }

  return <AppShell onChanged={load} />;
}
