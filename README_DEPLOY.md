# Deploy (GitHub Pages + Backend)

## 1. Структура
- backend (Express + SQLite / better-sqlite3)
- frontend (Create React App)

## 2. База данных
Backend использует SQLite файл `backend/db/game.sqlite3`.
В проде хранить БД в постоянном volume (Render: Persistent Disk, Railway: Volume). На GitHub Pages база не работает (только статика), поэтому backend нужен на отдельной платформе.

## 3. Переменные окружения backend
Создайте `.env` в `backend/`:
```
BOT_TOKEN=123456:ABCDEF  # токен бота для проверки initData
DEV_MODE=0               # 1 отключает проверку подписи Telegram
DB_FILE=./db/game.sqlite3
```

## 4. Запуск backend локально
```
cd backend
npm install
npm run migrate   # если нужен отдельный скрипт миграций
npm start
```
Сервер: http://localhost:3001

## 5. Запуск фронта локально (dev)
```
cd frontend
npm install
npm start
```
React Dev Server на http://localhost:3000 (проксируйте API в package.json "proxy": "http://localhost:3001" при желании).

## 6. Prod сборка фронта
```
cd frontend
npm run build
```
Папка `frontend/build` автоматически раздаётся backend'ом при наличии.

## 7. GitHub Pages вариант
GitHub Pages может хранить только статику. Варианты:
1. **Backend на Render / Railway / Fly.io**, фронт на Pages. В `frontend/.env` задаём:
```
REACT_APP_API_BASE=https://your-backend-host
```
Собираем и пушим папку `build` в ветку `gh-pages`.
2. **Всё на одном VPS** — проще: собираем фронт, копируем `build` в backend, запускаем `node index.js` за reverse proxy (Nginx) + systemd.

### Шаги Pages + Render
1. Задеплойте backend (Render web service, Node 18). Build Command:
```
npm install
cd backend
npm install
```
Start Command:
```
node backend/index.js
```
(or ONE repo: set root command `node backend/index.js`).
2. Добавьте переменные окружения на Render: BOT_TOKEN, DEV_MODE=0.
3. Получите публичный URL, например `https://afk-backend.onrender.com`.
4. В `frontend/.env`:
```
REACT_APP_API_BASE=https://afk-backend.onrender.com
```
5. Сборка:
```
cd frontend
npm run build
```
6. Создайте ветку `gh-pages` и поместите содержимое `frontend/build` в корень этой ветки. Включите Pages (Deploy from branch gh-pages / root).
7. Откройте `https://username.github.io/repo-name/` — фронт будет использовать backend через REACT_APP_API_BASE.

## 8. Telegram WebApp
Если WebApp открыт внутри Telegram и домен фронта отличается от backend:
- Авторизационный вызов `/auth` тоже идёт на REACT_APP_API_BASE.
- Убедитесь что CORS на backend `origin:true` (у нас так).

## 9. Смена API без пересборки
Можно добавить в index.html до bundle:
```html
<script>window.__API_BASE__='https://afk-backend.onrender.com';</script>
```
И в коде сначала читать window.__API_BASE__. (Сейчас не реализовано — можно добавить при необходимости.)

## 10. Nodemon (опционально)
Для hot reload backend:
```
npm install --save-dev nodemon
```
package.json (backend):
```
"scripts": { "dev": "nodemon index.js" }
```

## 11. Резервное копирование БД
Периодически копируйте `game.sqlite3`. Скрипт:
```
sqlite3 backend/db/game.sqlite3 ".backup 'backup_$(date +%Y%m%d_%H%M).sqlite3'"
```

## 12. Мини чеклист продакшена
- [ ] BOT_TOKEN установлен
- [ ] DEV_MODE=0
- [ ] HTTPS (Render / Railway auto)
- [ ] БД на постоянном диске
- [ ] REACT_APP_API_BASE у фронта корректен
- [ ] /ping отвечает 200
- [ ] Продажа предметов меняет coins
- [ ] CORS не блокирует (проверить Network)

## 13. Быстрый тест после деплоя
```
fetch('https://your-backend/ping').then(r=>r.json())
```
Ожидаем `{ pong:true }`.

## 14. Возможные доработки деплоя
- Healthcheck endpoint (у нас /ping).
- Логирование в файлы (winston / pino) вместо console.
- Rate limiting (express-rate-limit) если откроете публично.
- Перенос секретов в `.env`.

## 15. Ошибки
Если фронт выдаёт "Ошибка продажи":
- Проверить Network → sell (URL совпадает с REACT_APP_API_BASE?)
- Ответ JSON (success?)
- 403 user_mismatch — initData не соответствует userId (отключите DEV_MODE).

---
Готово.

## 17. GitHub Actions автоматический деплой на gh-pages

Теперь используется workflow `.github/workflows/deploy-pages.yml`:

Что делает:
1. Триггеры: push в `main` (или `master`) изменяющий `frontend/**`, вручную через `workflow_dispatch`.
2. Устанавливает Node 18, выполняет `npm ci` в `frontend`.
3. Собирает `npm run build` с переменной окружения `REACT_APP_API_BASE` из `secrets.WEBAPP_API_BASE`.
4. Публикует содержимое `frontend/build` в ветку `gh-pages` (форсируя orphan — чистая история статического сайта).

Как настроить секрет:
1. В репо GitHub → Settings → Secrets and variables → Actions → New repository secret.
2. Имя: `WEBAPP_API_BASE`, значение: ваш прод backend URL (например `https://your-backend.example.com`).
3. Сохранить.

Как обновить API без пересборки (вариант):
- Можно хранить `public/config.json` и заменить его через отдельный deploy (или сделать маленький workflow только для него).

Локальная разработка vs прод:
- Локально CRA может использовать proxy (package.json `proxy`) на `http://localhost:3001`.
- В проде React бандл инжектирует переменную на этапе сборки, поэтому при смене backend без пересборки используйте runtime `config.json` (уже есть в build) или `<script>window.__API_BASE__=...</script>`.

Почему снова игнорируем `frontend/build`:
- Артефакт сборки не хранится в `main`, что уменьшает размер истории и шум в PR.
- Источник истины — код, а не собранный bundle.

Ручной форс деплой (если нужно быстро):
1. Измените любой файл во `frontend/` (например `public/deploy-stamp.txt`).
2. `git commit -m "chore: trigger deploy" && git push` — Actions запустит сборку.

Проблемы:
- Если workflow не стартует: убедитесь что файл `.github/workflows/deploy-pages.yml` в ветке `main` и Actions не отключены.
- 404 на GitHub Pages: проверьте что в Settings → Pages выставлена ветка `gh-pages` и путь `/ (root)`.
- Белый экран / неправильный роутинг: SPA fallback обеспечивают `200.html` + `404.html` (см. postbuild скрипт). peaceiris/actions-gh-pages их публикует.

Очистка / миграция:
- Старый способ с `git subtree push` больше не нужен. Можно удалить временно закоммиченный build из истории через rebase/фильтр при желании (опционально).

---
Обновлено: автоматический деплой активен.

## 16. Подключение к Telegram боту как WebApp
1. Соберите и задеплойте фронт: получите публичный URL (например https://username.github.io/repo-name/ или https://your-domain/app/).
2. Убедитесь что страница отдает корректный HTML (откройте в браузере). Добавьте в <head> (опционально) цветовую схему под Telegram:
```html
<meta name="theme-color" content="#1a2329" />
```
3. В BotFather откройте /setdomain если используете WebApp авторизацию через initData (домен backend) и /setinline или /setuserpic по желанию.
4. Основное: /setmenu → выбрать бота → задать кнопку Menu Button: type = Web App, URL = ваш фронт URL.
5. Или используйте команду `/setwebapp` (если доступно) для установки WebApp ссылок.
6. После сохранения в клиенте Telegram (мобильный) откройте профиль бота → кнопка меню (или кнопку под полем ввода) откроет Web App.
7. Backend должен быть доступен по REACT_APP_API_BASE домену (совпадает с domain, который вы указали BotFather для подписи initData). Если домены различаются, Telegram всё равно передаст initData, но подпись BOT_TOKEN должна сходиться.
8. Проверка: откройте WebApp, в DevTools (Desktop Telegram позволяет) либо временно выведите `console.log(window.Telegram?.WebApp?.initData);` — не забудьте убрать для прод.

### Пример Content-Security-Policy (опционально)
Если будете настраивать CSP заголовок, добавьте:
```
default-src 'self';
connect-src 'self' https://your-backend-host https://api.telegram.org;
img-src 'self' data: https://*.telegram.org https://api.telegram.org;
script-src 'self';
style-src 'self' 'unsafe-inline';
```
Адаптируйте под ваш домен.

### Частые ошибки
- 401 missing init data: не передан заголовок x-telegram-init (проверить что открыто внутри Telegram, а не во внешнем браузере).
- 401 invalid hash: BOT_TOKEN не совпадает с тем, что у бота, либо испорчен initData.
- 403 user_mismatch: в запросе userId не совпал с id из initData → убедитесь что при devMode=0 userId отправляется именно из auth.

