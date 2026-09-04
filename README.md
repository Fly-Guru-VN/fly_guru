# FlyGuru

Сайт и CRM школы электрофойлов FlyGuru в Нячанге: публичные страницы,
заявки, клиенты, занятия, абонементы, смены, выплаты, агентские рефералы и
Telegram Mini App для клиентов.

## Что является источником правды

1. Исполняемый код в `src/`.
2. Последовательность SQL-миграций в `supabase/migrations/`.
3. `supabase/seed.sql` — итоговый справочник услуг только для чистой базы.
4. Документы — объяснение текущей реализации, но не замена проверки кода.

Актуальный обзор системы: [`docs/flyguru_architecture.md`](docs/flyguru_architecture.md).
Практические команды: [`docs/commands.md`](docs/commands.md).

## Текущее состояние

Реализованы:

- публичные страницы: главная, обучение, тандем, клуб, цены, отзывы, контакты
  и витрина магазина;
- формы заявок, атрибуция источников и агентские ссылки/QR;
- CRM админа и рабочие кабинеты инструктора, механика и СММ;
- учёт клиентов, занятий, абонементов, смен, расходов и выплат;
- кабинет агента со статистикой, материалами и выплатами;
- кабинет клиента как Telegram Mini App: остаток минут, запись, отмена и история;
- Telegram-уведомления, SMTP-сброс пароля и Vercel Cron.

В коде ещё остаётся старый invite/password-flow для членов клуба. Основной
клиентский кабинет сейчас работает через Telegram; legacy-flow не следует
расширять, пока не принято решение оставить его или удалить.

## Стек

- Next.js 16 App Router, React 19, TypeScript;
- Tailwind CSS v4;
- Supabase Postgres, Auth, Storage и RLS;
- next-intl: `ru` без префикса, каркас `en` и `vi`;
- Vercel, регион `syd1`;
- Telegram Bot API и SMTP.

## Структура

```text
src/app/[locale]/        публичные страницы и кабинеты
src/app/api/             API, Telegram webhook и cron-задачи
src/components/          общие UI-компоненты
src/content/             тексты публичных услуг и товаров
src/lib/                 бизнес-логика, расчёты, auth и Supabase
messages/                сообщения next-intl
scripts/                 операционные скрипты
supabase/migrations/     миграции 0001…0054 в строгом порядке
supabase/seed.sql        стандартные услуги для воспроизводимой базы
docs/                    актуальный обзор и инструкции
```

## Локальный запуск

Требуется Node.js 20+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Приложение откроется на `http://localhost:3000`. Все переменные и назначение
трёх Telegram-ботов описаны в `.env.example`. Секреты нельзя добавлять в Git
или вставлять в документацию.

## Проверки перед коммитом

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run test:e2e
```

Unit-тесты покрывают отдельные функции бизнес-логики. Интеграционные тесты
server actions и RLS пока отсутствуют, поэтому изменения авторизации и денежных
расчётов нужно дополнительно проверять сценариями разных ролей. Playwright
проверяет публичные страницы в desktop/mobile Chromium, ошибки браузерной
консоли и защитные HTTP-заголовки. Перед первым локальным запуском установите
браузер: `npx playwright install chromium`.

Те же lint, typecheck, unit tests, build и public E2E запускаются в
`.github/workflows/ci.yml` для pull request и push в `main`. Quality job
проверяет Node 20 и production-major Node 24; browser E2E работает на Node 24,
как текущий Vercel-проект.

## Воспроизводимая база Supabase

Supabase CLI и `supabase/config.toml` закреплены в проекте. Для запуска
локального стека нужен работающий Docker daemon:

```bash
npx supabase start
npx supabase db reset
```

Миграции должны выполниться все, от `0001_init.sql` до текущей последней.
`db reset` пересоздаёт **локальную** базу, применяет миграции и затем seed.
`seed.sql` добавляет недостающие стандартные услуги по уникальному `code`, не
перезаписывая уже существующие строки.

При ручной установке через SQL Editor порядок такой:

1. Выполнить **каждый** файл `supabase/migrations/*.sql` по номеру.
2. После последней миграции выполнить `supabase/seed.sql`.
3. Проверить, что у стандартных услуг заполнены уникальные `code`.

Нельзя ограничиваться одной миграцией `0001`: последующие файлы добавляют
роли, RLS-политики, денежную модель, Telegram-кабинет и остальные рабочие поля.

Для новой одноразовой dev/staging-базы можно использовать `db push
--include-seed`. Для production — только предварительный просмотр и pending
миграции, без seed:

```bash
npx supabase link --project-ref <project-ref>
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

Перед DDL-изменениями production нужна проверяемая резервная копия. Никогда не
используйте `db reset --linked` для production: команда удаляет данные.

## Деплой

Production разворачивается на Vercel из основной ветки. Перед выкладкой нужно:

- выполнить четыре проверки выше;
- применить недостающие миграции;
- сверить Environment Variables с `.env.example`;
- убедиться, что `TELEGRAM_CLIENT_BOT_SECRET` и `CRON_SECRET` заданы;
- проверить webhook клиентского бота командой из `docs/commands.md`.

Основной домен и редирект со служебного Vercel-домена задаются в
`next.config.ts`. Точные DNS-значения нужно брать из текущего Vercel Dashboard,
а не из старых инструкций.
