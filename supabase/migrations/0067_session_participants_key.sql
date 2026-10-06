-- ============================================================================
-- 0067: session_participants — свой id вместо составного ключа.
--
-- Почему. В 0066 ключом таблицы стала пара (session_id, client_id). PostgREST
-- считает такую таблицу связкой «многие-ко-многим» между sessions и clients, и
-- у sessions → clients стало ДВА пути: через sessions.client_id и через
-- участников. Любой запрос с clients(...) внутри sessions (и наоборот) падал с
-- PGRST201 «more than one relationship was found» — лёг весь учёт сессий.
--
-- Связкой PostgREST признаёт только таблицу, где обе ссылки входят в первичный
-- ключ (или уникальное ограничение). Поэтому ключ — отдельный id, а дубли
-- «тот же человек дважды в одном туре» держит уникальный ИНДЕКС: он работает
-- для ON CONFLICT (upsert в коде), но связкой таблицу не делает.
--
-- Накатывается вручную через Supabase SQL Editor. Идемпотентно.
-- ============================================================================

begin;

alter table public.session_participants
  drop constraint if exists session_participants_pkey;

alter table public.session_participants
  add column if not exists id uuid not null default gen_random_uuid();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.session_participants'::regclass and contype = 'p'
  ) then
    alter table public.session_participants add primary key (id);
  end if;
end $$;

create unique index if not exists session_participants_session_client_idx
  on public.session_participants (session_id, client_id);

commit;

-- Перечитать схему сразу, а не ждать, пока PostgREST заметит сам.
notify pgrst, 'reload schema';
