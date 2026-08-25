-- ============================================================================
-- 0049 — кабинет агента: право читать своё + дата рождения в профиле.
-- Накатывается вручную через Supabase SQL Editor (как 0001–0048), ПЕРЕД пушем
-- кода: без этих политик кабинет /agent откроется пустым (переходов ноль,
-- наград ноль), а сохранение даты рождения упадёт на несуществующей колонке.
--
-- ── Зачем ────────────────────────────────────────────────────────────────────
-- Решение David от 25.08.2026: у агентов появляется свой вход. До сих пор
-- агент был строкой в базе — реф-ссылка, награды, выплаты, — а видел всё это
-- только начальник в админке. Теперь агент заходит сам и видит РОВНО своё:
-- сколько людей по его ссылке пришло, кто именно, сколько он заработал,
-- сколько ему уже отдали.
--
-- ── Что здесь ────────────────────────────────────────────────────────────────
-- Только ЧТЕНИЕ и только своих строк. Ничего писать агенту не разрешено: имя,
-- фото и дату рождения меняет серверный экшен под service_role — ровно как у
-- сотрудников (RLS не умеет ограничивать НАБОР колонок, и клиент с валидным
-- JWT переписал бы себе ставку или тариф; та же причина, что в 0020 и 0047).
--
-- Клиентов и заявки агент читает не через RLS, а через сервер: в этих таблицах
-- лежат телефоны и внутренние заметки школы, а политика отдаёт строку целиком.
-- Кабинет берёт оттуда только имя и дату — см. src/lib/agentCabinet.ts.
-- ============================================================================

-- ── Кто я как агент ──────────────────────────────────────────────────────────
-- security definer + фиксированный search_path — тот же приём, что у
-- app_user_id() (0005) и app_role() (0026): функция читает agents в обход RLS
-- самой agents, иначе политика ссылалась бы сама на себя.
-- NULL, если у залогиненного нет строки агента, — тогда ни одна политика ниже
-- не совпадёт (сравнение с NULL не истинно).
create or replace function public.app_agent_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select a.id
  from agents a
  join users u on u.id = a.user_id
  where u.auth_id = auth.uid()
$$;

grant execute on function public.app_agent_id() to authenticated;

-- Свой реф-код — им считаются переходы по ссылке.
create or replace function public.app_agent_code()
returns text
language sql stable security definer
set search_path = public
as $$
  select a.ref_code
  from agents a
  join users u on u.id = a.user_id
  where u.auth_id = auth.uid()
$$;

grant execute on function public.app_agent_code() to authenticated;

-- ── agents: своя строка ──────────────────────────────────────────────────────
-- Нужна кабинету ради реф-кода, тарифа и признака «выключен».
drop policy if exists agents_select_own on agents;
create policy agents_select_own on agents
  for select to authenticated
  using (id = app_agent_id());

-- ── referral_rewards: свои награды ───────────────────────────────────────────
-- Это и есть «сколько я заработал». Чужие награды (второго агента, участника
-- клуба) под условие не попадают.
drop policy if exists rewards_select_own_agent on referral_rewards;
create policy rewards_select_own_agent on referral_rewards
  for select to authenticated
  using (referrer_type = 'agent' and referrer_id = app_agent_id());

-- ── agent_payouts: свои выплаты ──────────────────────────────────────────────
-- «Сколько мне уже отдали». Суммы чужих выплат агенту не видны.
drop policy if exists agent_payouts_select_own on agent_payouts;
create policy agent_payouts_select_own on agent_payouts
  for select to authenticated
  using (agent_id = app_agent_id());

-- ── ref_visits: переходы по своей ссылке ─────────────────────────────────────
-- Первая ступень воронки в кабинете. Таблица общая на все коды школы, поэтому
-- условие — строго свой код.
drop policy if exists ref_visits_select_own_agent on ref_visits;
create policy ref_visits_select_own_agent on ref_visits
  for select to authenticated
  using (code = app_agent_code());

-- ── users.birthday ───────────────────────────────────────────────────────────
-- Дата рождения в профиле (просьба David от 25.08.2026). Отдельной колонкой, а
-- не поверх age: возраст у сотрудников заполнен числом, и переписывать его
-- задним числом нечем — из «26» дату рождения не восстановить. Возраст там, где
-- он нужен, считается из birthday, если она заполнена (src/lib/dates.ts).
alter table users
  add column if not exists birthday date;

comment on column users.birthday is
  'Дата рождения. Заполняется человеком в «Настройках»; age остаётся у тех, кто завёл только возраст';
