-- 0029: права механика (RLS).
-- Накатывается вручную через Supabase SQL Editor, ПОСЛЕ 0028 (там добавляется
-- само значение user_role.'mechanic' — отдельной транзакцией, иначе Postgres
-- ругнётся «unsafe use of new value of enum type»).
--
-- Принцип: механик — это персонал на пляже, поэтому почти везде он встаёт
-- рядом с инструктором в уже существующих политиках. Отличий три:
--   • сессии он ТОЛЬКО читает (и все, а не свои): записывает он не сессию,
--     а заявку — занятие потом оформляет принявший её инструктор;
--   • заявки он создаёт (insert), но не правит: судьба заявки — дело админа
--     и инструктора;
--   • в shifts он не пишет вообще. Открытие/закрытие смены и снятие премии
--     идут через серверные экшены под service_role — ровно по той же причине,
--     что описана в 0020: RLS не умеет ограничивать НАБОР колонок, и клиент с
--     валидным JWT мог бы выставить себе opened_at = 08:00.
--
-- Денег механика это всё не касается: ЗП и статистика считаются по
-- role = 'instructor' (lib/salary, lib/payroll, lib/stats) — его там нет.

-- ── users: персонал видит персонал (было 0015) ───────────────────────────────
-- role сравниваем через ::text: role — это enum user_role, и литерал 'mechanic'
-- пришлось бы приводить к типу, который добавили только что (см. 0028).
drop policy if exists users_select_staff on users;
create policy users_select_staff on users
  for select to authenticated
  using (
    app_role() in ('instructor', 'mechanic', 'admin')
    and role::text in ('instructor', 'mechanic', 'admin')
  );

-- ── shifts: смотрит смены всех (было 0014) ───────────────────────────────────
drop policy if exists shifts_select_staff on shifts;
create policy shifts_select_staff on shifts
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic', 'admin'));

-- ── equipment: список досок и крыльев для съёмки (было 0019) ─────────────────
drop policy if exists equipment_select_staff on equipment;
create policy equipment_select_staff on equipment
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic', 'admin'));

-- ── shift_photos: свои снимает, чужие видит (было 0019) ──────────────────────
-- Видит все: в календаре механик смотрит фото любой смены — он же и отвечает
-- за то, в каком состоянии вернули оборудование.
drop policy if exists shift_photos_select_staff on shift_photos;
create policy shift_photos_select_staff on shift_photos
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic', 'admin'));

drop policy if exists shift_photos_insert_own on shift_photos;
create policy shift_photos_insert_own on shift_photos
  for insert to authenticated
  with check (
    app_role() in ('instructor', 'mechanic')
    and created_by = app_user_id()
    and exists (
      select 1 from shifts s
      where s.id = shift_id and s.instructor_id = app_user_id()
    )
  );

drop policy if exists shift_photos_delete_own on shift_photos;
create policy shift_photos_delete_own on shift_photos
  for delete to authenticated
  using (
    app_role() in ('instructor', 'mechanic')
    and exists (
      select 1 from shifts s
      where s.id = shift_id and s.instructor_id = app_user_id()
    )
  );

-- ── clients: имена клиентов в списке сессий (было 0005) ──────────────────────
drop policy if exists clients_select_staff on clients;
create policy clients_select_staff on clients
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic', 'admin'));

-- ── bookings: видит записи по дням и заводит новые (было 0005) ───────────────
drop policy if exists bookings_select_staff on bookings;
create policy bookings_select_staff on bookings
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic', 'admin'));

-- Заявку механик создаёт (клиент подошёл к нему на пляже) — дальше она уходит
-- инструкторам в Telegram и в их «Записи». Двигать статус и править карточку
-- он не может: bookings_update_staff остаётся без изменений.
create policy bookings_insert_mechanic on bookings
  for insert to authenticated
  with check (app_role() = 'mechanic');

-- ── sessions: только чтение, зато всех (новое) ───────────────────────────────
-- Механику нужен ответ на вопрос «что сегодня реально откатали» — суммы и
-- инструкторы. Писать сессии он не может: sessions_insert_instructor (0005)
-- по-прежнему требует роль instructor.
create policy sessions_select_mechanic on sessions
  for select to authenticated
  using (app_role() = 'mechanic');

-- ── Справочники расходов и оплаты (было 0016) ────────────────────────────────
drop policy if exists expense_categories_select_staff on expense_categories;
create policy expense_categories_select_staff on expense_categories
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic', 'admin'));

drop policy if exists payment_methods_select_staff on payment_methods;
create policy payment_methods_select_staff on payment_methods
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic', 'admin'));

-- ── expenses: свои траты (было 0016) ─────────────────────────────────────────
-- Как у инструктора: ровно свои строки, ни чужих сумм, ни удаления чужого.
drop policy if exists expenses_instructor_select_own on expenses;
create policy expenses_instructor_select_own on expenses
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic') and created_by = app_user_id());

drop policy if exists expenses_instructor_insert_own on expenses;
create policy expenses_instructor_insert_own on expenses
  for insert to authenticated
  with check (app_role() in ('instructor', 'mechanic') and created_by = app_user_id());

drop policy if exists expenses_instructor_delete_own on expenses;
create policy expenses_instructor_delete_own on expenses
  for delete to authenticated
  using (app_role() in ('instructor', 'mechanic') and created_by = app_user_id());
