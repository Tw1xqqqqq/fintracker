import Database from "@tauri-apps/plugin-sql";

const DB_URL = "sqlite:fintracker.db";

let dbPromise: Promise<Database> | null = null;

// Единое соединение. Схема создаётся миграциями tauri-plugin-sql
// (см. src-tauri/src/lib.rs) и применяется при первом Database.load.
export function openDatabase(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}
