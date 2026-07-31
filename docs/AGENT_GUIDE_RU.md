# Полная инструкция для агента: Gemini Lookbook Queue

## Назначение

Расширение управляет локальной очередью промтов для **ручной** работы пользователя в Gemini. Это не Gemini API-клиент, не средство обхода ограничений, не краулер и не автокликер.

## Границы

Разрешено:
- создавать, импортировать, редактировать и хранить локальную очередь промтов;
- копировать следующий промт в буфер;
- открывать официальный сайт Gemini в новой вкладке;
- формировать CSV/TSV-подобный вход для lookbook-проектов;
- подготавливать prompts для **собственных вымышленных** моделей и оригинальных композиций.

Запрещено добавлять без отдельного решения владельца:
- чтение/экспорт cookies, OAuth-токенов, истории Gemini или персональных данных;
- CAPTCHA/2FA обход, прокси-ротацию, антидетект, параллельные аккаунты или обход тарифов/лимитов;
- автоматическую отправку промта, клики Generate, скачивание результатов или скрытый headless-браузер;
- публикацию контента от имени пользователя;
- подражание реальным людям, брендовым фотосессиям или копирование Pinterest-изображений.

## Архитектура MVP

```text
popup.html + popup.css
  └─ форма очереди и кнопки
popup.js
  ├─ parser: slug | prompt | negative | notes
  ├─ chrome.storage.local
  ├─ clipboard: copy prompt
  └─ chrome.tabs.create: открывает gemini.google.com
manifest.json
  └─ Manifest V3; permissions: storage, tabs
```

Нет background service worker, content script, сетевых запросов, remote code или telemetry.

## Формат очереди

Одна непустая строка:

```text
slug | prompt | negative | notes
```

- `slug` — уникальный стабильный ID, например `001_city_walk_hero`;
- `prompt` — обязательный текст для модели;
- `negative` — необязательные нежелательные элементы;
- `notes` — необязательная редакторская пометка.

Строки с `#` считаются комментариями. Разделитель — вертикальная черта. Внутри prompt не применять `|`; если это необходимо, заменить на запятую/двоеточие.

## Стандарт Fashion 50+

Перед созданием prompt должен существовать look record:

```text
look_id, audience, situation, palette, silhouette,
product URLs/SKU, match status, availability check time
```

Промт описывает визуализацию, а не выдумывает характеристики товара. Пример:

```text
012_theatre_hero | Original editorial full-body lookbook of an elegant fictional 58-year-old woman wearing a deep navy midi dress, tailored ivory blazer and low block heels; poised, natural confidence, theatre foyer, warm evening light, high-end magazine styling, vertical 9:16 | text, logo, watermark, distorted fingers, extra limbs, duplicate accessories | AI visualization: product links verified separately
```

Обязательно:
- использовать `fictional` / собственную модель;
- указывать возрастной диапазон, посадку, палитру, свет, кадрирование;
- подбирать кадр под платформу: `vertical 9:16` для Shorts/Reels, `16:9` для YouTube;
- отделять статус реального товара (`exact_match`, `close_match`, `style_analogue`) от AI-кадра.

## Установка и проверка

1. `node --check popup.js`.
2. Проверить `manifest.json` через `python -m json.tool manifest.json`.
3. В Chrome открыть `chrome://extensions` → Developer mode → Load unpacked → каталог проекта.
4. Открыть popup, вставить две корректные строки, загрузить.
5. Убедиться, что счётчик показывает `1 из 2`.
6. Нажать Copy и вставить содержимое в обычный текстовый редактор: prompt и `Avoid:` должны совпадать.
7. Нажать Open Gemini: должна открыться только официальная страница.
8. Перезапустить браузер и проверить, что очередь сохранилась локально.

## Изменения

Перед любым изменением:
1. сохранить текущее состояние и проверить `git status`;
2. сделать минимальный патч;
3. не расширять permissions без описания причины в README;
4. не добавлять удалённые скрипты/CDN;
5. повторить static check и ручную проверку popup;
6. обновить README и этот файл, если меняется поведение или граница доступа.

## Публикация GitHub

Публичный релиз допускается только после проверки, что в репозитории нет:
- ключей, cookies, сессий, файлов из профиля Chrome;
- личных ссылок, товарных кабинетов, артикулов/аналитики клиентов;
- материалов без права распространения.

Минимум для первого release: `manifest.json`, popup-файлы, README, AGENT_GUIDE_RU.md, LICENSE, `.gitignore`, demo queue. После push проверить public URL и архив `archive/refs/heads/main.zip`.
