-- ============================================================================
-- 0066: экскурсии и сафари — число людей и участники тура.
--
-- Решения начальника от 06.10.2026 (правила денег — в src/lib/tours.ts):
-- один тур = одна сессия. В ней контактное лицо (client_id), кто вёз
-- (instructor_id) и сумма за всех. Здесь добавляем то, чего сессии не хватало:
--
--  • sessions.people — сколько человек ехало. От него считается цена (взрослая
--    экскурсия от двух — по 3 000 000 ₫ с каждого). У обычных занятий всегда 1.
--  • session_participants — остальные участники, если это разные люди: каждого
--    можно завести отдельным клиентом. Деньги к участникам не привязаны — чек
--    и фикс инструктору живут на самой сессии.
--
-- Пишет в session_participants только сервер: админ своим клиентом (политика
-- admin_all), СММщик и инструктор — служебным ключом после проверки в коде,
-- как сами сессии (0030, 0055). Читают — те же, кто видит сессию.
--
-- Накатывается вручную через Supabase SQL Editor ДО деплоя кода: запись тура
-- пишет people и участников. Идемпотентно.
--
-- ⚠️ Составной ключ ниже ломал PostgREST (две связи sessions ↔ clients) —
-- сразу за этой миграцией обязательно 0067, она меняет ключ на свой id.
-- ============================================================================

begin;

alter table public.sessions
  add column if not exists people smallint not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sessions_people_range'
  ) then
    alter table public.sessions
      add constraint sessions_people_range check (people between 1 and 10);
  end if;
end $$;

create table if not exists public.session_participants (
  session_id uuid not null references public.sessions(id) on delete cascade,
  client_id  uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, client_id)
);

create index if not exists session_participants_client_idx
  on public.session_participants (client_id);

alter table public.session_participants enable row level security;

drop policy if exists session_participants_admin_all on public.session_participants;
create policy session_participants_admin_all on public.session_participants
  for all to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');

drop policy if exists session_participants_select_office on public.session_participants;
create policy session_participants_select_office on public.session_participants
  for select to authenticated
  using (app_role() in ('smm', 'mechanic'));

-- Инструктор видит участников только своих туров — как и сами сессии
-- (sessions_select_instructor).
drop policy if exists session_participants_select_instructor on public.session_participants;
create policy session_participants_select_instructor on public.session_participants
  for select to authenticated
  using (
    app_role() = 'instructor'
    and exists (
      select 1 from public.sessions s
      where s.id = session_id and s.instructor_id = app_user_id()
    )
  );

commit;
