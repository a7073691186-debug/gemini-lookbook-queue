# Prompt Queue Extensions for Gemini & ChatGPT

Набор Chrome-расширений (Manifest V3) для последовательной работы с промтами при генерации изображений.

## 1. Gemini Lookbook Queue — ручной безопасный поток

Корневой проект — лёгкая ручная очередь для Gemini. Он не использует cookies, не обходит CAPTCHA/лимиты, не отправляет промты сам и не скачивает чужие данные.

**Поток:** загрузить очередь → скопировать промт → открыть Gemini → вручную вставить, проверить и сгенерировать → скачать результат штатной кнопкой Gemini.

### Быстрый старт

1. Скачайте [Gemini ZIP v0.1.0](https://github.com/a7073691186-debug/gemini-lookbook-queue/releases/download/v0.1.0/gemini-lookbook-queue-v0.1.0.zip) и распакуйте его.
2. Откройте `chrome://extensions`.
3. Включите **Режим разработчика**.
4. Нажмите **Загрузить распакованное расширение** и выберите папку с `manifest.json`.
5. Вставьте очередь и нажмите **Загрузить очередь**.

Формат одной строки:

```text
001_city_walk | Editorial full-body lookbook photo of a stylish 58-year-old woman, camel coat, cream knit, wide-leg trousers, city street, natural daylight, vertical 9:16 | logo, text, watermark, distorted hands | Autumn capsule, medium budget
```

## 2. ChatGPT Prompt Queue Control — автоматизированная очередь

Исходники и готовый архив: [`extensions/chatgpt-prompt-queue-control/`](extensions/chatgpt-prompt-queue-control/).

Расширение запускается только на `chatgpt.com` / `chat.openai.com` и даёт правую панель управления:

- очередь промтов, префикс и суффикс;
- малый тест, запуск, пауза, продолжение и остановка;
- контроль появления результата, таймауты и повторы;
- прогресс, таймеры и live-лог;
- сквозную нумерацию файлов `slide_001…`;
- сбор сгенерированных кадров текущей страницы в ZIP по кнопке **«Скачать картинки этой страницы ZIP»**.

Для GPT по умолчанию выставлены: максимум ожидания — 120 секунд, пауза после готового кадра — 10 секунд, интервал — 0,2 минуты. Первый запуск делайте через **«Малый тест»** с 2–3 промтами.

> Расширение не хранит пароли, cookies, API-ключи или токены; не обходит CAPTCHA, лимиты и правила сервиса. Не обновляйте страницу до скачивания ZIP: накопитель кадров живёт в текущей вкладке.

## Для Fashion 50+

Один лук удобно вести четырьмя кадрами:

```text
001_hero | ... full-body editorial lookbook, 50+ model, 9:16 | text, logo, distorted hands | главный вертикальный кадр
002_detail | ... waist-up detail, textile texture, 50+ model, 9:16 | text, logo, distorted hands | детали образа
003_wide | ... full-body editorial lookbook, 50+ model, 16:9 | text, logo, distorted hands | YouTube preview
004_alt | ... same look, alternate pose, 50+ model, 9:16 | text, logo, distorted hands | запасной вариант
```

Не заявляйте, что AI-визуализация — фактическая каталожная фотография товара. Реальные артикулы, наличие и цены проверяются отдельно.

## Что хранится

Gemini Lookbook Queue хранит очередь в `chrome.storage.local` текущего Chrome-профиля. ChatGPT Queue хранит настройку и накопитель ZIP только в текущем Chrome-профиле/вкладке. Сервер, аналитика и API-ключи не используются.

## Лицензия

MIT. Смотрите [LICENSE](LICENSE).
