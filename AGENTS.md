# Инструкции для AI-агентов FlyGuru

## Источник правды

- Реальное поведение определяют `src/`, `supabase/migrations/`, актуальный
  `supabase/seed.sql` и конфигурационные файлы.
- `docs/flyguru_architecture.md` — карта проекта, но спор с кодом всегда решается
  проверкой кода. Исторические миграции и старые чек-листы не описывают текущее
  состояние целиком.
- Перед изменением схемы прочитайте все миграции после затрагиваемой таблицы.
  Новую миграцию добавляйте следующим номером; уже применённые миграции не
  переписывайте.

## Память проекта и поиск

- Используйте `codebase-memory-mcp` для обзора архитектуры, зависимостей и impact
  analysis.
- Граф памяти не считать исчерпывающим списком App Router-маршрутов. Маршруты
  проверять также через `rg --files src/app`.
- SQL с `parse_partial` проверять текстовым поиском и чтением самих миграций.
- После существенных изменений обновлять индекс памяти проекта
  `home-project1-fly_guru`.

## Безопасность и внешние системы

- Не читать и не печатать значения секретов без необходимости. Никогда не
  коммитить `.env*`, токены, пароли и service-role key.
- `SUPABASE_SERVICE_ROLE_KEY` допустим только в server-only коде и локальных
  административных скриптах.
- Не менять production Supabase, Telegram webhook, Vercel или другие внешние
  системы без явного разрешения пользователя. Сначала использовать dry-run или
  read-only режим, если он есть.
- На серверных action/route обработчиках проверять роль и принадлежность данных,
  а не полагаться только на `proxy.ts` или скрытую кнопку интерфейса. Для
  привилегированных обработчиков использовать `getActiveAppUser`, чтобы старая
  сессия уволенного сотрудника не сохраняла доступ.
- Никогда не отдавать клиенту `bookings.internal_note` или `sessions.note`;
  для Mini App разрешены только явно публичные поля `public_note`.
- Фото клиентов и смен лежат в private Storage. В интерфейс передавать только
  короткоживущие signed URL после пользовательского/RLS-запроса; постоянный
  public URL для бакетов `clients` и `shifts` не создавать. Для таких URL у
  `next/image` оставлять `unoptimized`, иначе общий optimizer-cache переживёт
  срок подписи.
- Глобальный запрет iframe имеет одно функциональное исключение: `/member`
  разрешён только для `https://web.telegram.org`. Не возвращать ему общий
  `X-Frame-Options: DENY`, иначе Telegram Mini App сломается в веб-клиенте.

## Доменные договорённости

- Основной язык интерфейса — русский.
- Локальные бизнес-даты относятся к часовому поясу Вьетнама; использовать
  существующие date helpers, не собирать дату через случайный UTC-срез.
- Канонический вход участника клуба — через Telegram Mini App и привязанный
  телефон. Legacy member invite/password-поток не расширять без отдельного
  решения о его судьбе.
- Агента сначала создают в админке, затем при необходимости вызывают
  `scripts/grant-agent-login.mjs`; не создавать дубль через `create-user.mjs`.
- Для воспроизводимой базы применять все миграции по порядку и только затем
  seed. На production не запускать seed и никогда не использовать
  `db reset --linked`.

## Проверка перед передачей результата

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Дополнительно проверить `git diff --check`, не включать в diff генерируемые
артефакты и не удалять чужие изменения. Для SQL-изменений отдельно проверить
порядок миграций, совместимость seed с финальной схемой и RLS/права.
При изменениях публичного UI, routing, proxy или HTTP-заголовков также запускать
`npm run test:e2e`; browser console/page errors считаются провалом проверки.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
