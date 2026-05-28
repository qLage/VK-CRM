# CRM — Локальная разработка и деплой

## Что нужно установить

1. **Node.js** — уже есть (v24.14.0)
2. **PostgreSQL 17** — скачать с https://www.postgresql.org/download/windows/
   - При установке запомни пароль от пользователя `postgres`
   - Убедись что «PostgreSQL Server» и «Command Line Tools» отмечены
3. **PuTTY** — уже есть

Redis не нужен — backend автоматически работает без него (in-memory fallback).

## Первый запуск (один раз)

```
1. Установи PostgreSQL 17
2. Запусти scripts\setup-db.bat     (создаст пользователя и БД)
3. Запусти scripts\restore-db.ps1   (зальёт копию production-данных)
4. Запусти start-dev.bat            (стартует backend + frontend)
5. Открой http://localhost:8080
```

## Ежедневная работа

```
start-dev.bat     — запуск (backend в отдельном окне + frontend)
stop-dev.bat      — остановка обоих серверов
```

Код в `src/` и `backend/src/` подхватывается автоматически:
- Frontend — Vite HMR (мгновенно)
- Backend — `tsx watch` (перезапуск ~1 сек)

## Обновить данные с прода

```powershell
.\scripts\dump-prod.ps1     # снимет свежий pg_dump с Selectel через SSH
.\scripts\restore-db.ps1    # зальёт его в локальный PostgreSQL
```

## Деплой на production

```powershell
.\scripts\deploy.ps1
```

Что делает скрипт:
1. Билдит frontend (`npm run build` -> `dist/`)
2. Билдит backend (`npm run build` -> `backend/dist/server.js`)
3. Архивирует нужные файлы (без node_modules, без dev-конфигов)
4. Заливает на сервер по SCP (через PuTTY)
5. Пересобирает Docker-контейнеры (`docker compose up -d --build`)

## Совместимость dev <-> prod

Один и тот же код. Различия только в `.env`:

| Параметр       | dev (локально)              | prod (сервер)                     |
|----------------|-----------------------------|-----------------------------------|
| DATABASE_URL   | localhost:5432              | Selectel managed PG (через сеть)  |
| REDIS_URL      | не задан (in-memory)        | Selectel managed Redis (TLS)      |
| FRONTEND_URL   | http://localhost:8080       | https://vkrysha-crm.ru            |
| NODE_ENV       | development                 | production                        |

**Менять код не нужно.** Переключение только через env-файлы.

## Структура файлов

```
C:\FILES\CRM\
  .env                      # prod-переменные (НЕ коммитить)
  .env.development           # dev-переменные
  start-dev.bat              # запуск dev-окружения
  stop-dev.bat               # остановка
  docker-compose.prod.yml    # production Docker (на сервере)
  package.json               # frontend deps
  vite.config.ts             # Vite config
  src/                       # frontend React code
  dist/                      # frontend build output
  backend/
    package.json             # backend deps
    src/server.ts            # entry point
    dist/server.js           # backend build output
  nginx/                     # nginx конфиги
  db_backup/                 # дамп production БД
  scripts/
    setup-db.bat             # первичная настройка PostgreSQL
    restore-db.ps1           # импорт дампа в локальную БД
    dump-prod.ps1            # снять свежий дамп с прода
    deploy.ps1               # деплой на сервер
```

## Полезные команды

```powershell
# подключение к локальной БД
psql -h localhost -U crm_user -d crm

# логи прод-сервера
& "C:\Program Files\PuTTY\plink.exe" -ssh -pw MLey9aXuvT4x root@155.212.180.138 -hostkey "SHA256:2Z+je6fjDnoIxrO/Noeex1a0OiW5nv8CoW08SF+j+E8" -batch "docker logs --tail 100 crm-backend-1"
```
