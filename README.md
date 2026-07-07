# FinTracker Desktop

Desktop-приложение для план-факт учета личных финансов, прогнозирования баланса и анализа расходов.

## Стек

- Tauri 2.x
- TypeScript
- React
- SQLite через `tauri-plugin-sql`
- TanStack Table
- Recharts

Что сделано на 07.07.2026
- Перенесено создание схемы из ручного CREATE TABLE в официальные миграции в lib.rs
- Заменили одноэкранное приветствие на страницу с сайдбаром: Дашборд, Операции, План, Настройки
- Сделан журнал операций: таблица с колонками дата / тип / статья / счёт / сумма / статус
<img width="1279" height="838" alt="image" src="https://github.com/user-attachments/assets/d51e482f-c7a9-496e-a257-1be73772913a" />
<img width="1274" height="841" alt="image" src="https://github.com/user-attachments/assets/e24cd4d3-3b3a-4014-a5e3-3b8cecfe694c" />
