# Gemini Lookbook Queue

Открытое Chrome-расширение (Manifest V3) для ведения очереди промтов в ручном процессе генерации изображений в Gemini.

> Оно не использует cookies, не обходит CAPTCHA/лимиты, не отправляет промты само и не скачивает чужие данные. Человек открывает Gemini, проверяет промт и нажимает Generate сам.

## Быстрый старт — 2 минуты

1. Скачайте [ZIP](https://github.com/a7073691186-debug/gemini-lookbook-queue/releases/download/v0.1.0/gemini-lookbook-queue-v0.1.0.zip) и распакуйте его.
2. Откройте `chrome://extensions`.
3. Включите **Режим разработчика**.
4. Нажмите **Загрузить распакованное расширение** и выберите папку проекта с `manifest.json`.
5. Закрепите расширение в панели Chrome.
6. Вставьте очередь и нажмите **Загрузить очередь**.

Формат одной строки:

```text
001_city_walk | Editorial full-body lookbook photo of a stylish 58-year-old woman, camel coat, cream knit, wide-leg trousers, city street, natural daylight, vertical 9:16 | logo, text, watermark, distorted hands | Autumn capsule, medium budget
```

Далее: **Копировать промт** → открыть Gemini → вставить → проверить → сгенерировать вручную → скачать результат обычной кнопкой Gemini.

## Для Fashion 50+

Один лук удобно вести четырьмя кадрами:

```text
001_hero | ... full-body editorial lookbook, 50+ model, 9:16 | text, logo, distorted hands | главный вертикальный кадр
002_detail | ... waist-up detail, textile texture, 50+ model, 9:16 | text, logo, distorted hands | детали образа
003_wide | ... full-body editorial lookbook, 50+ model, 16:9 | text, logo, distorted hands | YouTube preview
004_alt | ... same look, alternate pose, 50+ model, 9:16 | text, logo, distorted hands | запасной вариант
```

Не заявляйте, что AI-визуализация — фактическая каталожная фотография товара. Реальные артикулы, наличие и цены проверяются отдельно в Telegram-каталоге.

## Что хранится

Очередь хранится только в `chrome.storage.local` текущего Chrome-профиля. Расширение не использует сервер, аналитику, аккаунт Gemini или API-ключи.

## Полная инструкция для агента

См. [docs/AGENT_GUIDE_RU.md](docs/AGENT_GUIDE_RU.md).

## Лицензия

MIT. Смотрите [LICENSE](LICENSE).
