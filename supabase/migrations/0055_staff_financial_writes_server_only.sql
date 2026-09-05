-- Некритичные роли пишут эти строки только через проверенные server actions.
-- RLS с проверкой владельца не ограничивает сумму, минуты и служебные поля.
begin;

drop policy if exists sessions_insert_instructor on public.sessions;
drop policy if exists bookings_insert_mechanic on public.bookings;
drop policy if exists expenses_instructor_insert_own on public.expenses;
drop policy if exists expenses_instructor_delete_own on public.expenses;

-- NOT VALID сохраняет исторические строки; новые INSERT/UPDATE уже проверяются.
-- Старые данные не исправляем автоматически: это отдельная сверка бухгалтерии.
alter table public.sessions
  add constraint sessions_amount_nonnegative check (amount >= 0) not valid,
  add constraint sessions_commission_nonnegative check (agent_commission >= 0) not valid,
  add constraint sessions_minutes_positive check (minutes_used is null or minutes_used > 0) not valid;
alter table public.expenses
  add constraint expenses_amount_positive check (amount > 0) not valid;

commit;
