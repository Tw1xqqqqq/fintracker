# FinTracker Desktop

Desktop-приложение для план-факт учета личных финансов, прогнозирования баланса и анализа расходов.

## Стек

- Tauri 2.x
- TypeScript
- React
- SQLite через `tauri-plugin-sql`
- TanStack Table
- Recharts

Что сделали за 20 - 21.07.2026
- Сделали парсер CSV - разделители ;/,, кодировки utf-8 / windows-1251, разбор дат и сумм
- Построиди экран «Импорт»
- Реализовали автокатегоризацию
- Сделали экран подтверждения — таблица распознанных операций с правкой категории/счёта и чекбоксами
- Сделали защиту от дублей при повторном импорте
- Сделали функцию расчёта текущего остатка каждого счёта
- Проверили влияние переводов на общий и отдельные балансы
- Сделали передачу endDate в аналитику
- Объединили интерфейс регулярности в popover и настройках
- Покрыли расчёты 2–3 юнит-тестами на ключевые случаи.


<img width="236" height="134" alt="image" src="https://github.com/user-attachments/assets/162f92d5-8486-4d9c-add2-c742440fdb20" />
<img width="1277" height="837" alt="image" src="https://github.com/user-attachments/assets/4913268c-f202-4508-b44c-620b1ff2970f" />
<img width="1034" height="211" alt="image" src="https://github.com/user-attachments/assets/fe9c2553-1ea3-4ffe-9df2-8ba758e1995d" />
<img width="535" height="467" alt="image" src="https://github.com/user-attachments/assets/ecedf3a3-3eb3-47f1-9e02-adafdb45d4a0" />
<img width="625" height="842" alt="image" src="https://github.com/user-attachments/assets/6b1736fe-75f6-4aad-97d4-154978bbae07" />




