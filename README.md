# FinTracker Desktop

Desktop-приложение для план-факт учета личных финансов, прогнозирования баланса и анализа расходов.

## Стек

- Tauri 2.x
- TypeScript
- React
- SQLite через `tauri-plugin-sql`
- TanStack Table
- Recharts

## Что уже есть

- Базовый Tauri 2 проект.
- React/Vite фронтенд.
- Первый рабочий экран план-факт:
  - баланс и прогноз;
  - плановые и фактические расходы;
  - график цепочки баланса;
  - таблица операций на TanStack Table.
- Подключен `tauri-plugin-sql` на Rust-стороне и подготовлен модуль `src/lib/db.ts` для таблицы операций.

## Команды

```bash
npm install
npm run dev
npm run build
npm run tauri -- info
npm run tauri -- dev
```

## Требования для десктопной сборки

На текущей машине Tauri CLI видит WebView2 и MSVC, но не видит Rust:

- `rustc`: not installed
- `cargo`: not installed
- `rustup`: not installed

Для `npm run tauri -- dev` и `npm run tauri -- build` нужно установить Rust через `rustup`.

## Ближайшие задачи

- Подключить реальные CRUD-операции к SQLite вместо seed-данных.
- Добавить формы создания операции, категории и счета.
- Реализовать расчет план-факт по неделям/месяцам.
- Добавить импорт CSV/XLSX банковских выписок и защиту от дублей.
- Вынести навигацию в полноценные разделы: операции, счета, статьи, импорт, аналитика.

