begin;

-- Журнал: статьи, короткие посты и новости на сайте (prompts/FLYGURU_JOURNAL_IDEA.md,
-- план согласован David 04.10.2026).
--
--   • Пишут админ, разработчик и СММщик из своих кабинетов. Посетитель читает
--     опубликованное без входа, черновики и скрытые посты не видит никто
--     снаружи — это держит сама база (RLS ниже), а не только интерфейс.
--   • Посты пока только на русском. Переводы — отдельный этап, если
--     начальник одобрит платный автоперевод.
--   • Запись — только служебным ключом из кода приложения
--     (src/app/[locale]/admin/journal/actions.ts), как у СММщика с 0040: что
--     именно меняется, решает код после getActiveAppUser. Политик на запись
--     здесь нет намеренно — своим ключом мимо интерфейса никто ничего не
--     изменит.
--
-- Миграция только добавляет новое: существующие таблицы не трогаются.

-- ── Категории ────────────────────────────────────────────────────────────────
-- Справочник правят сами админ и СММщик (этап 2). Категорию с постами не
-- удаляют, а скрывают: посты не должны молча терять её.
create table if not exists public.journal_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 60),
  sort integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.journal_categories (name, sort) values
  ('Обучение', 10),
  ('Обслуживание и ремонт', 20),
  ('Новости и события', 30),
  ('Истории FlyGuru', 40)
on conflict (name) do nothing;

-- ── Посты ────────────────────────────────────────────────────────────────────
-- body — список блоков: [{"type":"text","text":"…"}, {"type":"photo",
-- "path":"2026/<uuid>.jpg","w":1600,"h":1200}, …]. Состав блоков и их поля
-- проверяет код (src/lib/journal.ts, parseBody): на сайт выводятся только
-- известные типы, HTML из базы не вставляется никогда.
--
-- status:
--   draft     — черновик, ни разу не публиковался;
--   published — виден всем;
--   hidden    — был опубликован и снят. Адрес отдаёт 404, но published_at
--               сохраняется: при повторной публикации дата не «молодеет».
--
-- slug замораживается после первой публикации (это делает код): смена адреса
-- ломает ссылки, которые уже разошлись по чатам и поисковику.
--
-- edited_at — когда текст опубликованного поста правили. На странице
-- показывается пометкой «изменено», как в Telegram.
create table if not exists public.journal_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120),
  title text not null check (length(btrim(title)) between 1 and 200),
  body jsonb not null default '[]'::jsonb check (jsonb_typeof(body) = 'array'),
  -- Обложка = первое фото поста; храним отдельно, чтобы список журнала не
  -- разбирал body каждой карточки.
  cover_path text,
  category_id uuid references public.journal_categories(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'hidden')),
  -- Подпись по умолчанию «Команда FlyGuru». Конкретный автор и источник —
  -- необязательные поля (этап 2).
  author_name text check (author_name is null or length(author_name) <= 100),
  source_name text check (source_name is null or length(source_name) <= 200),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  edited_at timestamptz,
  -- Опубликованный или скрытый пост обязан помнить дату первой публикации.
  check (status = 'draft' or published_at is not null)
);

-- Лента журнала: опубликованные, свежие сверху.
create index if not exists journal_posts_published_idx
  on public.journal_posts (published_at desc)
  where status = 'published';

-- ── Доступ ───────────────────────────────────────────────────────────────────
alter table public.journal_categories enable row level security;
alter table public.journal_posts enable row level security;

-- Названия категорий не секрет: их показывает публичная страница журнала.
drop policy if exists journal_categories_select_all on public.journal_categories;
create policy journal_categories_select_all on public.journal_categories
  for select to anon, authenticated
  using (true);

-- Посетитель (и любой вошедший) видит только опубликованное.
drop policy if exists journal_posts_select_published on public.journal_posts;
create policy journal_posts_select_published on public.journal_posts
  for select to anon, authenticated
  using (status = 'published');

-- Офис видит всё, включая черновики. app_role() отдаёт 'admin' и
-- разработчику (0045), а уволенному — пустую строку (0054).
drop policy if exists journal_posts_select_office on public.journal_posts;
create policy journal_posts_select_office on public.journal_posts
  for select to authenticated
  using (app_role() in ('admin', 'smm'));

-- ── Фото ─────────────────────────────────────────────────────────────────────
-- Публичный бакет, как avatars (0006): фото опубликованных постов должен
-- видеть любой посетитель и поисковик. Путь — <год>/<случайный uuid>.<ext>,
-- угадать фото черновика нельзя, листинга нет. Пишет только служебный ключ
-- на сервере после проверки роли — политик для authenticated нет.
--
-- Фото клиентов и смен по-прежнему в приватных бакетах (0052): этот бакет
-- их не касается.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'journal',
  'journal',
  true,
  4194304, -- 4 МБ, как PHOTO_MAX_BYTES в src/lib/photos.ts
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

commit;
