-- ============================================================================
-- 0047 — смену открывает любой сотрудник: права СММщика на смену.
-- Накатывается вручную через Supabase SQL Editor (как 0001–0046), ПЕРЕД пушем
-- кода: без этих политик экран /smm/shift не примет фото и смена не откроется.
--
-- ── Зачем ────────────────────────────────────────────────────────────────────
-- Решение David от 21.08.2026: СММщик второй день работает как инструктор, и
-- школа не хочет вносить такие дни в расчёт руками. Теперь смену открывает
-- любой сотрудник, а деньги за неё считаются сами:
--
--   • инструктор и СММщик — 200 000 ₫ за выход по регламенту, доля 15% с
--     занятий дня и доля котла абонементов (src/lib/staff → SHIFT_CREW_ROLES);
--   • механик открывает смену так же, но за неё не получает ничего: у него
--     оклад 10 млн в месяц (src/lib/salary → MECHANIC_MONTH_PAY);
--   • админ и разработчик — боссы: их выход не оплачивается.
--
-- Фикс СММщика (2 млн за неделю) при этом остаётся: СММ-работу он делает
-- по-прежнему, сменные идут сверху.
--
-- ── Что здесь ────────────────────────────────────────────────────────────────
-- Только ЧТЕНИЕ плюс свои фото смены — ровно тот же набор, что у механика в
-- 0029. В сам shifts СММщик, как и все, не пишет: открытие и закрытие идут
-- через серверные экшены под service_role, потому что RLS не умеет ограничивать
-- НАБОР колонок и клиент с валидным JWT выставил бы себе opened_at = 08:00
-- (та же причина, что в 0020).
--
-- role сравниваем через ::text, как в 0029 и 0040.
-- ============================================================================

-- ── shifts: видит смены всех (было 0014, 0029) ───────────────────────────────
-- Кому нужно: свой экран «Смена» и календарь дня.
drop policy if exists shifts_select_staff on shifts;
create policy shifts_select_staff on shifts
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic', 'smm', 'admin'));

-- ── equipment: список досок и крыльев для съёмки (было 0019, 0029) ───────────
drop policy if exists equipment_select_staff on equipment;
create policy equipment_select_staff on equipment
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic', 'smm', 'admin'));

-- ── shift_photos: свои снимает, чужие видит (было 0019, 0029) ────────────────
drop policy if exists shift_photos_select_staff on shift_photos;
create policy shift_photos_select_staff on shift_photos
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic', 'smm', 'admin'));

-- Подшить кадр можно только к СВОЕЙ смене: без exists ниже сотрудник с валидным
-- JWT мог бы дописать фото в чужую и открыть кому-то смену за него.
drop policy if exists shift_photos_insert_own on shift_photos;
create policy shift_photos_insert_own on shift_photos
  for insert to authenticated
  with check (
    app_role() in ('instructor', 'mechanic', 'smm')
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
    app_role() in ('instructor', 'mechanic', 'smm')
    and exists (
      select 1 from shifts s
      where s.id = shift_id and s.instructor_id = app_user_id()
    )
  );
