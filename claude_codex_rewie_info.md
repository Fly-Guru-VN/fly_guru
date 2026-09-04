# FlyGuru: отчёт Codex для Claude Code

Дата: 4 сентября 2026 года. Этот файл описывает изменения в текущей рабочей
ветке `codex/security-hardening-20260904` относительно `main` (`2c977e39`). Он
нужен, чтобы следующая сессия Claude не приняла исправления за случайный
незавершённый рефакторинг и не вернула закрытые уязвимости.

## Состояние на момент передачи

- Изменения разложены по логическим коммитам в ветке
  `codex/security-hardening-20260904`. Актуальный статус PR и CI нужно смотреть
  в GitHub, а preview — в Vercel.
- Открыт PR: https://github.com/Fly-Guru-VN/fly_guru/pull/1. На последнем
  проверенном code SHA все checks были зелёными: Quality Node 20, Quality Node
  24, Public E2E 22/22 и Vercel build. Production merge/deploy не выполнялся.
- Отдельный Preview в доступном проекте `fly-guru/fly-guru` напрямую проверен
  Chromium: 22/22 desktop/mobile smoke-тестов прошли. Deployment Protection не
  отключалась; использован Vercel Automation Bypass только из окружения.
- В локально связанный Vercel-проект `fly-guru/fly-guru`
  (`prj_I5ps3Ds3JN13yIxuViaFxzomNsks`) для Preview и Production добавлены
  скрытые `TELEGRAM_CLIENT_BOT_TOKEN`, `TELEGRAM_CLIENT_BOT_SECRET` и новый
  случайный `CRON_SECRET`. Их значения не выводились и не сохранялись в Git.
- GitHub App при этом публикует PR в другом Vercel-контексте,
  `fly-guru-vn/fly-guru`. Текущий CLI-аккаунт не может прочитать его deployment,
  поэтому наличие `CRON_SECRET` именно там независимо не подтверждено. До merge
  нужно определить настоящий production-проект и дать CLI доступ к нему либо
  исправить Git-интеграцию.
- Telegram webhook и production deployment не изменялись.
- По сообщению владельца проекта, миграции `0051`–`0054` применены 4 сентября
  2026 года. Codex не сверял production-схему независимо и не выполнял DDL.
- Текущий код проходит lint, TypeScript, 81 unit-тест, production build и 22
  browser E2E-проверок.
- Онлайн `npm audit` не находит известных уязвимостей.
- Перед продолжением обязательно прочитай `AGENTS.md`: там закреплены источник
  правды, границы доступа, правила приватных фото и команды проверки.

## Зачем проводилась ревизия

Пользователь попросил проверить качество кода, ошибки, мусор, потенциальные
грабли, безопасность, документацию и плагин памяти проекта. Источником правды
считался текущий код и миграции, а устаревшие README/документы приводились в
соответствие с ними.

Изменения делались последовательно и после каждого чувствительного этапа
проверялись lint, типы, тесты и/или production build. Последний adversarial
проход отдельно проверял границы между обычным пользовательским Supabase
клиентом и `service_role`.

## Что изменено и почему

### 1. Документация и память проекта

- Обновлены `README.md`, `docs/commands.md`, `docs/creating-users.md`,
  `docs/flyguru_architecture.md`, `questions.md`, `.env.example` и
  `supabase/seed.sql` по фактическому коду.
- Добавлен корневой `AGENTS.md` с постоянными правилами для AI-агентов.
- `codebase-memory-mcp` обновлён с `0.9.0` до `0.10.8` и зарегистрирован в
  Codex. Финальный индекс `home-project1-fly_guru` имеет статус `ready`:
  2786 узлов и 10025 связей.
- SQL у memory-плагина частично помечается `parse_partial`. Это ограничение
  best-effort парсера, поэтому миграции всегда дополнительно читать через
  `rg`/обычный просмотр файлов.

### 2. Аутентификация и права

- В `src/lib/auth.ts` добавлен `getActiveAppUser()`. Привилегированные server
  actions и admin API теперь проверяют не только роль, но и то, что сотрудник
  ещё работает.
- Миграция `0054_fired_users_fail_closed.sql` меняет `app_role()`: уволенный
  сотрудник теряет права RLS уже в дату `left_at` по времени Вьетнама, даже со
  старым refresh token.
- Логин получил отдельные лимиты по IP и по хэшу аккаунта. Email/телефон не
  хранятся открытым текстом в памяти лимитера.
- Ошибочные логин и телефон отвечают одинаково, чтобы не раскрывать наличие
  аккаунта.
- Восстановление пароля в production всегда использует канонический `SITE_URL`
  и не доверяет клиентскому `Host`/`x-forwarded-proto`.
- Телефонные аккаунты без реального email и неизвестные аккаунты теперь также
  получают одинаковый внешний ответ формы сброса пароля.

### 3. Telegram

- `/api/tg` работает fail-closed: без `TELEGRAM_CLIENT_BOT_SECRET` возвращает
  `503`, с неверным секретом — `401`.
- Секрет webhook сравнивается через SHA-256 и `timingSafeEqual`.
- `scripts/setup-client-bot.mjs` больше не регистрирует небезопасный webhook
  без секрета.
- Напоминание о смене сообщает успех только после успешного ответа Telegram;
  cron возвращает `502`, если отправка не удалась.

### 4. Данные клиентского Mini App

- `bookings.internal_note` и `sessions.note` признаны только служебными.
  Клиентский кабинет их больше не выбирает и не возвращает.
- Миграция `0051_member_public_notes.sql` добавляет явные клиентские поля
  `public_note`. Старые внутренние заметки туда намеренно не копируются.
- Все чтения кабинета проверяют ошибки БД. Сбой больше не выглядит как
  отсутствие телефона, абонемента, записей или истории.
- Для записи обязателен телефон из карточки клиента.
- Отмена бронирования обновляет только активный статус и не может затереть
  завершение/отмену, сделанную сотрудником параллельно.
- Ошибка чтения списаний или корректировок абонемента больше не считается
  нулём и не разрешает использовать лишние минуты.

### 5. Приватные фото и загрузки

- Миграция `0052_private_operational_photos.sql` делает бакеты `clients` и
  `shifts` приватными, добавляет `clients.photo_path` и оставляет старые URL
  только для переходного чтения.
- Интерфейс получает фото клиентов и смен только через короткоживущие signed
  URL. Для них используется `next/image unoptimized`, чтобы общий optimizer
  cache не переживал срок подписи.
- `checkPhoto()` теперь асинхронно проверяет magic bytes JPEG/PNG/WebP, а не
  доверяет одному MIME из формы.
- Замена фото клиента вынесена в `replacePrivateClientPhoto()`: проверяется UUID
  и существование клиента, новый объект пишется под уникальным путём, строка БД
  переключается только после успешной загрузки, затем безопасно удаляется
  прежний объект. Ошибка БД не ломает старое фото.
- Миграция `0053_shift_photo_path_guard.sql` связывает путь фото смены с
  `shift_id`, `phase` и `kind`. Constraint добавлен `NOT VALID`: он уже защищает
  новые insert/update, но старые production-строки нужно проверить перед
  отдельным `VALIDATE CONSTRAINT`.
- Ручное удаление фото смены явно проверяет `shifts.instructor_id === user.id`
  до любого действия `service_role`, валидирует путь, удаляет Storage первым и
  проверяет фактическое удаление строки.
- Cron очистки при ошибке Storage сохраняет строки для повторной попытки и
  полностью прекращает удаление, если встречает небезопасный путь.

### 6. Fail-closed поведение бизнес-операций

- Ошибки чтения денежных данных, статистики, источников и агентского кабинета
  больше не превращаются в правдоподобные нули.
- Принятие/отказ от заявки проверяют результат записи в БД.
- Реферальный код не признаётся отсутствующим при сбое БД: успешная заявка не
  теряет реального владельца/скидку, а браузер не кэширует временный `503` как
  «не агент».
- QR и referral landing различают неизвестный код и недоступную базу.

### 7. Next.js, perimeter и зависимости

- `src/middleware.ts` заменён на `src/proxy.ts` для Next.js 16.
- Next.js и `eslint-config-next` обновлены с `16.2.10` до `16.3.4`, Tailwind и
  PostCSS-цепочка обновлены; lockfile пересобран.
- Добавлены `nosniff`, Referrer Policy, Permissions Policy и защита от
  clickjacking.
- `/member` — единственное исключение: `frame-ancestors` разрешает только
  `'self'` и `https://web.telegram.org`, потому что Telegram Web открывает Mini
  App во frame. Кабинеты и auth-страницы сохраняют `frame-ancestors 'none'` и
  `X-Frame-Options: DENY`.
- Для admin/instructor/mechanic/smm/agent/login добавлен явный `noindex`;
  `/smm` добавлен в `robots.ts`.

### 8. Браузерные проверки и CI

- Добавлены Playwright 1.62.1 и Chromium 151. Публичный smoke-набор проверяет
  семь страниц в desktop/mobile, HTTP-статусы, ошибки console/page и защитные
  заголовки.
- E2E обнаружил бесконечный 307 между публичным URL и внутренним locale-route:
  Next 16.3 повторно вызывал proxy после rewrite next-intl. `src/proxy.ts`
  теперь не запускает локализацию второй раз, но всё равно выполняет auth и
  role checks. Обычный и поддельный locale-header на `/admin` проверены: оба
  отправляют гостя на login.
- `SiteHeader` переведён на locale-aware `usePathname`; это устранило hydration
  mismatch активного пункта меню. Анимированные WebP помечены `unoptimized`,
  чтобы Next не пытался прогнать их через неподдерживаемый optimizer.
- Добавлен GitHub Actions CI: lint, TypeScript, unit tests и build на Node 20/24,
  public E2E на Node 24 (текущий runtime проекта Vercel).
- Supabase CLI 2.116.0 и `supabase/config.toml` добавлены в проект. В текущем
  контейнере нет Docker daemon/systemd, поэтому локальный DB integration test
  здесь не запускался.
- В Codex зарегистрирован Playwright MCP в headless/isolated режиме. Он
  появится среди инструментов после перезапуска сессии.

## Новые файлы

- `AGENTS.md`
- `src/proxy.ts` вместо удалённого `src/middleware.ts`
- `src/lib/loginSecurity.ts` и тест
- `src/lib/privateStorage.ts` и тест
- `src/lib/memberCabinet.test.ts`
- `src/lib/photos.test.ts`
- `src/lib/subscriptions.test.ts`
- `src/lib/telegram.test.ts`
- `supabase/migrations/0051_member_public_notes.sql`
- `supabase/migrations/0052_private_operational_photos.sql`
- `supabase/migrations/0053_shift_photo_path_guard.sql`
- `supabase/migrations/0054_fired_users_fail_closed.sql`
- `playwright.config.ts` и `e2e/public-smoke.spec.ts`
- `.github/workflows/ci.yml`
- `supabase/config.toml`

## Проверки, которые уже прошли

```text
npm run lint        PASS
npx tsc --noEmit    PASS
npm test            PASS, 81/81
npm run build       PASS, Next.js 16.3.4, 88 pages
npm run test:e2e    PASS, 22/22 (desktop + mobile Chromium)
npm audit           PASS, 0 vulnerabilities
git diff --check    PASS
```

На локально запущенном production server дополнительно проверялись реальные
HTTP-заголовки:

- `/member`: разрешён только `'self' https://web.telegram.org`, без XFO;
- `/admin`: `frame-ancestors 'none'` и `X-Frame-Options: DENY`;
- `/training`: `frame-ancestors 'none'`.

Полноценные SQL integration tests не запускались: в окружении нет локального
Supabase/Postgres/Docker-контура. Миграции проверены чтением и impact analysis;
их применение к production известно только со слов владельца.

## Как безопасно продолжать

1. Не восстанавливай `middleware.ts`: в Next.js 16 его заменяет `proxy.ts`.
2. Сначала просмотри историю ветки, `AGENTS.md` и миграции `0051`–`0054`.
3. Перед deploy независимо сверь наличие миграций `0051`–`0054` и проверь Mini
   App, кабинеты, загрузку/чтение фото и старые строки `shift_photos` на
   staging/preview либо контролируемым production smoke-test.
4. Схема `0051`–`0054` должна существовать до запуска нового server code;
   `0052` одновременно закрывает публичность двух бакетов.
5. Seed на production не запускать. Не использовать `db reset --linked`.
6. После любых изменений снова выполни четыре команды из `AGENTS.md`,
   `git diff --check` и обнови индекс `home-project1-fly_guru`.
7. Нерешённые продуктовые вопросы не угадывай: они сокращены и зафиксированы в
   `questions.md` (в том числе судьба legacy invite/password member flow).

## Оставшаяся инфраструктурная работа

- GitHub CLI авторизован как `EzDavidos` (права `ADMIN` на репозиторий), Vercel
  CLI — как `ezdavidos`, доступ к team/project `fly-guru/fly-guru` подтверждён.
- GitHub Vercel App деплоит в `fly-guru-vn/fly-guru`, которого текущий CLI не
  видит. До production deploy нужно выдать `ezdavidos` доступ именно к этому
  team/project либо подтвердить, что эта интеграция устарела и должна быть
  перепривязана к `fly-guru/fly-guru`.
- После устранения расхождения независимо проверить в настоящем production-
  проекте `TELEGRAM_CLIENT_BOT_TOKEN`, `TELEGRAM_CLIENT_BOT_SECRET` и
  `CRON_SECRET`. Затем проверить Preview, получить явное подтверждение владельца
  и только после этого merge/deploy в production.
- Поднять local Supabase на хосте с Docker либо создать отдельную staging базу
  для миграционных и RLS integration tests.
- `.claude/settings.local.json` уже сокращён до минимальных allow/ask/deny.
  Исходная локальная версия сохранена вне Git как
  `.claude/settings.local.backup-20260904.json`.
