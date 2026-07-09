# FinTracker Desktop

Desktop-приложение для план-факт учета личных финансов, прогнозирования баланса и анализа расходов.

## Стек

- Tauri 2.x
- TypeScript
- React
- SQLite через `tauri-plugin-sql`
- TanStack Table
- Recharts

Что сделали  09.07.2026
- Сделана генерация недель финансового года из даты старта, наполнение week_plans.
- Написана функция сквозного пересчёта цепочки баланса по неделям (расширен существующий balanceSeries в finance.ts).
- Сделали определение кассовых разрывов (недели с отрицательным балансом).
- Покрыли расчёты 2–3 юнит-тестами на ключевые случаи.
  

<img width="642" height="599" alt="image" src="https://github.com/user-attachments/assets/1f4128ca-867f-4ec3-bbb9-5cb594015975" />
<img width="683" height="415" alt="image" src="https://github.com/user-attachments/assets/723fb0af-b50d-49af-8a16-051b84d31bef" />




