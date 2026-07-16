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
    },
    Migration {
        version: 3,
        description: "create_week_category_plans",
        sql: "
            CREATE TABLE IF NOT EXISTS week_category_plans (
                week_start  TEXT NOT NULL,
                category_id TEXT NOT NULL REFERENCES categories(id),
                amount      REAL NOT NULL DEFAULT 0,
                PRIMARY KEY (week_start, category_id)
            );
        ",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 4,
        description: "create_recurring_rules",
        sql: "
            CREATE TABLE IF NOT EXISTS recurring_rules (
                id            TEXT PRIMARY KEY,
                type          TEXT NOT NULL,
                category_id   TEXT NOT NULL REFERENCES categories(id),
                account_id    TEXT NOT NULL REFERENCES accounts(id),
                amount        REAL NOT NULL,
                interval_days INTEGER NOT NULL,
                start_date    TEXT NOT NULL,
                end_date      TEXT,
                description   TEXT NOT NULL DEFAULT ''
            );
            ALTER TABLE operations ADD COLUMN recurring_id TEXT;
        ",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 5,
        description: "create_reconciliations",
        sql: "
            CREATE TABLE IF NOT EXISTS reconciliations (
                id           TEXT PRIMARY KEY,
                date         TEXT NOT NULL,
                expected     REAL NOT NULL,
                actual       REAL NOT NULL,
                diff         REAL NOT NULL,
                operation_id TEXT,
                created_at   TEXT NOT NULL
            );
        ",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 6,
        description: "extend_recurring_rules",
        sql: "
            ALTER TABLE recurring_rules
                ADD COLUMN recurrence_kind TEXT NOT NULL DEFAULT 'interval';
            ALTER TABLE recurring_rules
                ADD COLUMN occurrence_count INTEGER;
        ",
        kind: MigrationKind::Up,
    },
    // ВНИМАНИЕ: SQL применённых миграций (v1–v7) менять нельзя — sqlx сверяет
    // чексуммы, и правка сломает запуск на базах, где миграция уже применена.
    // Известный нюанс v7: перенос плана в operations требует наличия счёта
    // (WHERE EXISTS accounts), а очистка week_category_plans безусловна — на базе
    // без счетов план был бы потерян. После онбординга счёт есть всегда,
    // поэтому кейс практически недостижим; фиксируем как известное поведение.
    Migration {
        version: 7,
        description: "unify_plans_and_add_linked_transfers",
        sql: "
            CREATE TABLE operations_v7 (
                id                TEXT PRIMARY KEY,
                date              TEXT NOT NULL,
                type              TEXT NOT NULL,
                status            TEXT NOT NULL,
                category_id       TEXT REFERENCES categories(id),
                account_id        TEXT NOT NULL REFERENCES accounts(id),
                amount            REAL NOT NULL,
                description       TEXT NOT NULL DEFAULT '',
                recurring_id      TEXT,
                source_account_id TEXT REFERENCES accounts(id),
                target_account_id TEXT REFERENCES accounts(id),
                transfer_id       TEXT
            );

            INSERT INTO operations_v7
                (id, date, type, status, category_id, account_id, amount, description, recurring_id)
            SELECT id, date, type, status, category_id, account_id, amount, description, recurring_id
              FROM operations;

            DROP TABLE operations;
            ALTER TABLE operations_v7 RENAME TO operations;
            CREATE INDEX idx_operations_date ON operations(date);
            CREATE INDEX idx_operations_status ON operations(status);
            CREATE INDEX idx_operations_transfer_id ON operations(transfer_id);

            INSERT OR IGNORE INTO operations
                (id, date, type, status, category_id, account_id, amount, description)
            SELECT 'manual-plan:' || p.week_start || ':' || p.category_id,
                   p.week_start,
                   c.type,
                   'planned',
                   p.category_id,
                   COALESCE(
                       (SELECT value FROM settings WHERE key = 'primaryAccountId'),
                       (SELECT id FROM accounts ORDER BY id LIMIT 1)
                   ),
                   p.amount,
                   'Ручной план'
              FROM week_category_plans p
              JOIN categories c ON c.id = p.category_id
             WHERE p.amount <> 0
               AND EXISTS (SELECT 1 FROM accounts);

            DELETE FROM week_category_plans;
        ",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 8,
        description: "custom_recurrence_fields",
        sql: "
            ALTER TABLE recurring_rules
                ADD COLUMN interval_unit TEXT NOT NULL DEFAULT 'day';
            ALTER TABLE recurring_rules
                ADD COLUMN weekdays TEXT;
            ALTER TABLE recurring_rules
                ADD COLUMN monthly_mode TEXT;
        ",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 9,
        description: "drop_week_category_plans",
        sql: "
            DROP TABLE IF EXISTS week_category_plans;
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
