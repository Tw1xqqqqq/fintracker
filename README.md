# FinTracker Desktop

Desktop-приложение для план-факт учета личных финансов, прогнозирования баланса и анализа расходов.

## Стек

- Tauri 2.x
- TypeScript
- React
- SQLite через `tauri-plugin-sql`
- TanStack Table
- Recharts

Что сделали 20.07.2026
- Сделали парсер CSV - разделители ;/,, кодировки utf-8 / windows-1251, разбор дат и сумм
- Построиди экран «Импорт»
- Реализовали автокатегоризацию
- Сделали экран подтверждения — таблица распознанных операций с правкой категории/счёта и чекбоксами
- Сделали защиту от дублей при повторном импорте
- Покрыли расчёты 2–3 юнит-тестами на ключевые случаи.


<img width="236" height="134" alt="image" src="https://github.com/user-attachments/assets/162f92d5-8486-4d9c-add2-c742440fdb20" />
<img width="1277" height="837" alt="image" src="https://github.com/user-attachments/assets/4913268c-f202-4508-b44c-620b1ff2970f" />

<img width="625" height="842" alt="image" src="https://github.com/user-attachments/assets/6b1736fe-75f6-4aad-97d4-154978bbae07" />




