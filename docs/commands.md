# Команды FlyGuru — шпаргалка

Все команды выполняются из корня репозитория. Скрипты, которым нужен доступ к
Supabase или Telegram, читают секреты из `.env.local`. Не передавайте
`SUPABASE_SERVICE_ROLE_KEY` клиентскому коду и не вставляйте секреты в команды,
если скрипт умеет взять их из окружения.

Подробная схема аккаунтов описана в [creating-users.md](./creating-users.md).

## Разработка и проверка

```bash
npm install
npm run dev       # dev-сервер через systemd scope с лимитом памяти
npm run dev:raw   # обычный next dev, если systemd недоступен
npm run lint
npx tsc --noEmit
npm test
npm run build
npx playwright install chromium  # один раз: браузер для локального E2E
npm run test:e2e                  # public smoke: desktop + mobile Chromium
npm run test:e2e:report           # открыть HTML-отчёт последнего прогона
npm run start     # запуск уже собранного production-приложения
```

Playwright поднимает Next на `127.0.0.1:3210` сам. Чтобы проверить уже
запущенный preview/production без локального сервера:

```bash
PLAYWRIGHT_BASE_URL=https://preview.example.com npm run test:e2e
```

Если локальный dev-сервер ведёт себя странно после изменения зависимостей или
ветки, остановите его, удалите только генерируемый каталог `.next` и запустите
снова. Не удаляйте другие каталоги проекта как универсальный способ починки.

## Аккаунты сотрудников

`create-user.mjs` создаёт Supabase Auth-аккаунт и связанную строку `users`.
Используйте его для ролей `admin`, `dev`, `instructor`, `mechanic`, `smm`:

```bash
node scripts/create-user.mjs --role admin --name "Денис" \
  --email denis@example.com --password "длинный-уникальный-пароль"

node scripts/create-user.mjs --role instructor --name "Иван" \
  --phone "+84 90 123 4567" --password "длинный-уникальный-пароль"
```

При входе по телефону скрипт создаёт технический email. Пароль не должен
попадать в git, логи или отчёты.

Не используйте `create-user.mjs` для обычного участника клуба: его кабинет
работает через Telegram и не требует Supabase Auth. Не используйте его и для
агента, которого уже создали через админку: появится дублирующая строка без
реферальной истории.

## Агент

Сначала создайте агента в админке — там формируются запись агента и реф-код.
Затем, если ему нужен вход в `/agent`, привяжите Auth-аккаунт к существующей
строке:

```bash
node scripts/grant-agent-login.mjs --code AB12CD \
  --email agent@example.com --password "длинный-уникальный-пароль"
```

Агента также можно найти по точному имени; примеры есть в комментарии в начале
`scripts/grant-agent-login.mjs`.

## Участник клуба

Канонический путь не использует пароль:

1. Администратор создаёт или находит клиента и оформляет абонемент.
2. Клиент открывает клиентского Telegram-бота.
3. Клиент отправляет боту свой контакт кнопкой Telegram.
4. Бот сопоставляет телефон с клиентом, после чего `/member` открывается как
   Telegram Mini App.

Старый password/invite-путь участника ещё присутствует в коде как legacy. Не
выдавайте через него новые доступы, пока этот поток не будет либо удалён, либо
снова сделан полноценным.

## Роль и пароль существующего аккаунта

Роль хранится в `users.role` и `app_metadata.role` Supabase Auth, поэтому её
нужно менять только скриптом:

```bash
node scripts/set-role.mjs --role admin --email boss@example.com
node scripts/set-role.mjs --role instructor --phone "+84 90 123 4567"
```

Текущая версия `set-role.mjs` принимает `admin`, `instructor`, `mechanic`,
`smm`, `member`, `agent`; роль `dev` этим скриптом пока не поддерживается. После
смены роли пользователь должен выйти и войти заново, чтобы получить новый JWT.

Смена пароля без письма:

```bash
node scripts/set-password.mjs --email user@example.com \
  --password "новый-длинный-уникальный-пароль"
```

## Клиентский Telegram-бот

Просмотреть настройки (read-only):

```bash
node scripts/setup-client-bot.mjs --show
```

Установить webhook и кнопку Mini App:

```bash
node scripts/setup-client-bot.mjs
node scripts/setup-client-bot.mjs --url https://example-tunnel.ngrok.io
```

В production обязательно задайте `TELEGRAM_CLIENT_BOT_SECRET`. Команда без
`--show` меняет внешнюю конфигурацию Telegram и должна запускаться осознанно.

## Отчёт в Telegram

```bash
node scripts/report-to-telegram.mjs         # только предпросмотр
node scripts/report-to-telegram.mjs --send  # реальная отправка
```

Сначала всегда проверяйте предпросмотр. `--send` меняет внешнее состояние и не
должен запускаться агентом без явного разрешения человека.

## База данных

Источник порядка — имена файлов `supabase/migrations/*.sql`. Для чистой базы
нужно применить **все** миграции от `0001` до последней по номеру, затем
`supabase/seed.sql`. Не ограничивайтесь `0001_init.sql`.

Локальная воспроизводимая база (нужен Docker; `supabase/config.toml` уже есть):

```bash
npx supabase start
npx supabase db reset
```

`db reset` удаляет только локальную базу по умолчанию, затем применяет все
миграции и seed. Для новой dev/staging-базы допустим `db push --include-seed`.
В production seed не запускайте:

```bash
npx supabase link --project-ref <project-ref>
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

Либо выполняйте ещё не применённые миграции по одной через Supabase SQL Editor,
если именно так ведётся production-база. Не запускайте весь каталог вслепую и
никогда не используйте `db reset --linked` для production.

Разовые скрипты обслуживания по умолчанию работают в режиме предпросмотра:

```bash
node scripts/backfill-booking-sessions.mjs
node scripts/backfill-booking-sessions.mjs --apply

node scripts/seed-shifts.mjs
node scripts/seed-shifts.mjs --apply
```

Перед `--apply` прочитайте начало соответствующего файла: эти команды изменяют
данные. `seed-shifts.mjs` содержит конкретный месячный график и не является
универсальным генератором смен.

## Память кодовой базы для Codex

Локальный MCP-сервер установлен глобально для Codex. Проверка регистрации:

```bash
codex mcp list
/home/project1/.local/bin/codebase-memory-mcp --version
/home/project1/.local/bin/codebase-memory-mcp cli index_status \
  --project home-project1-fly_guru --verbose true
```

После изменения MCP-конфигурации перезапустите Codex/IDE. Граф памяти полезен
для обзора связей и impact analysis, но SQL-файлы с частичным разбором и полный
перечень App Router-маршрутов дополнительно проверяйте обычным поиском по коду.

В конфигурации Codex также зарегистрирован Playwright MCP. Он запускает
локальный `node_modules/.bin/playwright-mcp` в headless/isolated режиме и
становится доступен после перезапуска Codex.
