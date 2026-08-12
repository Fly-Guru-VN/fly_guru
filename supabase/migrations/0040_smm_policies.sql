-- ============================================================================
-- 0040 — что видит СММщик. Накатывать ПОСЛЕ 0039 (там роль добавлена в enum).
--
-- Здесь только ЧТЕНИЕ. Пишет СММщик тем же способом, что инструктор с 0030:
-- служебным ключом из кода приложения, а не своим — что именно меняется,
-- решает код (src/app/[locale]/admin/actions.ts), а не набор политик. RLS не
-- умеет ограничивать НАБОР КОЛОНОК, поэтому политика «smm может update
-- bookings» разрешила бы ему переписать запросом мимо интерфейса что угодно в
-- любой заявке. Своим ключом он не изменит ничего.
--
-- Набор таблиц ровно под его 12 вкладок: заявки, сессии, клиенты, абонементы,
-- агенты, материалы, источники + справочники, которые эти экраны показывают.
-- Смен, инвентаря, услуг, выплат и членов клуба здесь намеренно нет — этих
-- вкладок у него не будет.
--
-- role сравниваем через ::text, как в 0029: role — это enum user_role, а
-- литерал 'smm' пришлось бы приводить к типу, значение которого добавили
-- только что (0039).
-- ============================================================================

-- ── users: персонал видит персонал (было 0015, 0029) ─────────────────────────
-- Кому нужно: «Принял: Денис» в заявке, выбор инструктора в форме сессии.
drop policy if exists users_select_staff on users;
create policy users_select_staff on users
  for select to authenticated
  using (
    app_role() in ('instructor', 'mechanic', 'smm', 'admin')
    and role::text in ('instructor', 'mechanic', 'smm', 'admin')
  );

-- ── Поток клиентов: заявки, занятия, клиенты, абонементы ─────────────────────
drop policy if exists bookings_select_staff on bookings;
create policy bookings_select_staff on bookings
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic', 'smm', 'admin'));

drop policy if exists clients_select_staff on clients;
create policy clients_select_staff on clients
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic', 'smm', 'admin'));

-- Сессии — все, как механику: выручка и воронка считаются по ним.
create policy sessions_select_smm on sessions
  for select to authenticated
  using (app_role() = 'smm');

drop policy if exists subscriptions_select_staff on subscriptions;
create policy subscriptions_select_staff on subscriptions
  for select to authenticated
  using (app_role() in ('instructor', 'smm', 'admin'));

-- Корректировки минут показываются в карточке абонемента рядом с остатком.
drop policy if exists sub_adjustments_select_staff on subscription_adjustments;
create policy sub_adjustments_select_staff on subscription_adjustments
  for select to authenticated
  using (app_role() in ('instructor', 'smm', 'admin'));

-- Членство видно в карточке клиента («в клубе с …»).
drop policy if exists memberships_select_staff on memberships;
create policy memberships_select_staff on memberships
  for select to authenticated
  using (app_role() in ('instructor', 'smm', 'admin'));

-- ── Агенты: карточки, награды, выплаты ───────────────────────────────────────
drop policy if exists agents_select_staff on agents;
create policy agents_select_staff on agents
  for select to authenticated
  using (app_role() in ('instructor', 'smm', 'admin'));

create policy rewards_select_smm on referral_rewards
  for select to authenticated
  using (app_role() = 'smm');

create policy agent_payouts_select_smm on agent_payouts
  for select to authenticated
  using (app_role() = 'smm');

-- ── Реклама: меченые ссылки и переходы по ним ────────────────────────────────
-- Это его рабочий инструмент: «Материалы» — готовые ссылки для постов,
-- «Источники» — сколько людей по ним пришло и во что это превратилось.
create policy materials_select_smm on materials
  for select to authenticated
  using (app_role() = 'smm');

create policy ref_visits_select_smm on ref_visits
  for select to authenticated
  using (app_role() = 'smm');

-- ── Справочники форм (было 0016, 0029) ───────────────────────────────────────
drop policy if exists payment_methods_select_staff on payment_methods;
create policy payment_methods_select_staff on payment_methods
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic', 'smm', 'admin'));

drop policy if exists expense_categories_select_staff on expense_categories;
create policy expense_categories_select_staff on expense_categories
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic', 'smm', 'admin'));

-- ── expenses: свои траты, как у инструктора и механика (было 0016, 0029) ─────
-- Расходы ШКОЛЫ (Marina, ЗП, СММ) СММщику не показываем — по ним считается
-- чистая прибыль, а её он не видит. Здесь ровно свои строки.
drop policy if exists expenses_instructor_select_own on expenses;
create policy expenses_instructor_select_own on expenses
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic', 'smm') and created_by = app_user_id());

drop policy if exists expenses_instructor_insert_own on expenses;
create policy expenses_instructor_insert_own on expenses
  for insert to authenticated
  with check (app_role() in ('instructor', 'mechanic', 'smm') and created_by = app_user_id());

drop policy if exists expenses_instructor_delete_own on expenses;
create policy expenses_instructor_delete_own on expenses
  for delete to authenticated
  using (app_role() in ('instructor', 'mechanic', 'smm') and created_by = app_user_id());
