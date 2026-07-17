# FinTracker Desktop

Desktop-приложение для план-факт учета личных финансов, прогнозирования баланса и анализа расходов.

## Стек

- Tauri 2.x
- TypeScript
- React
- SQLite через `tauri-plugin-sql`
- TanStack Table
- Recharts

Что сделали 17.07.2026
- Переделали ячейки режима «Факт» в двухстрочные: сверху сумма факта, снизу дельта «+N₽ к плану»
- Добавили дельту к плану в строку «Итоговый баланс» в режиме «Факт»
- Добавили значок регулярности (календарик) у статей, на которых висит регулярное правило
- Реализовали пользовательскую настройку у регулярности статей
- Проверили tsc и тесты
- Покрыли расчёты 2–3 юнит-тестами на ключевые случаи.


<img width="1272" height="838" alt="image" src="https://github.com/user-attachments/assets/4e178138-277d-43e6-bcb2-0257e96ca4d8" />
<img width="1282" height="840" alt="image" src="https://github.com/user-attachments/assets/23191759-ef48-422a-8192-a4ef9bf10d37" />
<img width="697" height="611" alt="image" src="https://github.com/user-attachments/assets/ee095504-bf3e-42a2-a258-033966dacf3e" />
<img width="1056" height="610" alt="image" src="https://github.com/user-attachments/assets/ff635621-b86a-4d0a-baba-511198037aa6" />

<img width="625" height="842" alt="image" src="https://github.com/user-attachments/assets/6b1736fe-75f6-4aad-97d4-154978bbae07" />




