import { useState } from "react";
import { Onboarding } from "./components/Onboarding";
import { AppShell } from "./components/AppShell";
import type { SetupData } from "./components/Onboarding";

const STORAGE_KEY = "fintracker.setup";

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

  const handleComplete = (data: SetupData) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setSetup(data);
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSetup(null);
  };

  if (!setup) {
    return <Onboarding onComplete={handleComplete} />;
  }

  return <AppShell setup={setup} onReset={handleReset} />;
}
