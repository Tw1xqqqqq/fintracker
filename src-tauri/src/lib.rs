use tauri_plugin_sql::{Migration, MigrationKind};

const DB_URL: &str = "sqlite:fintracker.db";

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_initial_schema",
        sql: "
            CREATE TABLE IF NOT EXISTS accounts (
                id      TEXT PRIMARY KEY,
                name    TEXT NOT NULL,
                type    TEXT NOT NULL,
                balance REAL NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS categories (
                id    TEXT PRIMARY KEY,
                name  TEXT NOT NULL,
                type  TEXT NOT NULL,
                color TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS operations (
                id          TEXT PRIMARY KEY,
                date        TEXT NOT NULL,
                type        TEXT NOT NULL,
                status      TEXT NOT NULL,
                category_id TEXT NOT NULL REFERENCES categories(id),
                account_id  TEXT NOT NULL REFERENCES accounts(id),
                amount      REAL NOT NULL,
                description TEXT NOT NULL DEFAULT ''
            );

            CREATE INDEX IF NOT EXISTS idx_operations_date ON operations(date);
            CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);

            CREATE TABLE IF NOT EXISTS week_plans (
                week_start     TEXT PRIMARY KEY,
                income_plan    REAL NOT NULL DEFAULT 0,
                expense_plan   REAL NOT NULL DEFAULT 0,
                income_actual  REAL NOT NULL DEFAULT 0,
                expense_actual REAL NOT NULL DEFAULT 0
            );
        ",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 2,
        description: "create_settings",
        sql: "
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        ",
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running FinTracker");
}
