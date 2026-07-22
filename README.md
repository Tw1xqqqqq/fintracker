# FinTracker Desktop

Desktop-приложение для план-факт учета личных финансов, прогнозирования баланса и анализа расходов.

## Стек

- Tauri 2.x
- TypeScript
- React
- SQLite через `tauri-plugin-sql`
- TanStack Table
- Recharts

Что сделали за 20 - 23.07.2026
- Сделали парсер CSV - разделители
- Построиди экран «Импорт»
- Оформили строку операции — иконка категории, значок регулярности, сумма, бейдж статуса и меню «Изменить / Удалить»
- Убрали из сайдбара разделы «Сверка» и «Аналитика» — остались «Бюджет» и «Операции»
- Сделали подсветку кассовых разрывов
- Реализовали вывод отрицательного итогового баланса красным даже в будущих неделях
- Добавили карточки итогов «Доходы», «Расходы», «Итог» на экране операций
- Вынесли логику «ожидает подтверждения» в общие функции и покрыли её юнит-тестами 

<img width="1272" height="849" alt="image" src="https://github.com/user-attachments/assets/84b1328c-bf02-4cd1-beba-439ea21026a8" />
<img width="1277" height="837" alt="image" src="https://github.com/user-attachments/assets/4913268c-f202-4508-b44c-620b1ff2970f" />
<img width="1032" height="486" alt="image" src="https://github.com/user-attachments/assets/e2bdff92-761c-44ed-a273-7425cba1b665" />
<img width="1031" height="607" alt="image" src="https://github.com/user-attachments/assets/a2d7506e-15ad-43a6-b0f0-fa49280abc97" />

<img width="625" height="842" alt="image" src="https://github.com/user-attachments/assets/6b1736fe-75f6-4aad-97d4-154978bbae07" />




