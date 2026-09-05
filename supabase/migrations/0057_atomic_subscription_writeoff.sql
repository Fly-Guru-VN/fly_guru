begin;

-- Оба кабинета используют одну транзакцию. Блокировка строки абонемента
-- сериализует конкурирующие списания и изменения его срока/статуса/лимита.
create function public.write_off_subscription(
  p_subscription_id uuid, p_minutes integer, p_date date,
  p_instructor_id uuid, p_actor_id uuid, p_note text default null
)
returns table (session_id uuid, left_minutes bigint)
language plpgsql security definer
set search_path = public
as $$
declare
  actor_role text;
  sub public.subscriptions%rowtype;
  remaining bigint;
  written_id uuid;
begin
  select u.role::text into actor_role from public.users u
  where u.id = p_actor_id
    and (u.left_at is null or u.left_at > timezone('Asia/Ho_Chi_Minh', now())::date);
  if actor_role is null or actor_role not in ('admin', 'dev', 'smm', 'instructor') then
    raise exception 'Нет доступа к списанию минут';
  end if;
  if p_minutes is null or p_minutes <= 0 or p_date is null then
    raise exception 'Укажите положительное целое число минут и дату';
  end if;
  if actor_role = 'instructor' and (
    p_instructor_id is distinct from p_actor_id
    or p_date <> timezone('Asia/Ho_Chi_Minh', now())::date
  ) then
    raise exception 'Инструктор может списывать только от своего имени за сегодня';
  end if;

  select * into sub from public.subscriptions
    where id = p_subscription_id for update;
  if not found then raise exception 'Абонемент не найден'; end if;
  if sub.status <> 'active' or (sub.expires_at is not null and sub.expires_at <= now()) then
    raise exception 'Абонемент не активен или истёк — списывать с него нельзя';
  end if;

  -- Новый snapshot ПОСЛЕ блокировки видит завершившееся конкурирующее списание.
  -- SUM в SQL не ограничен max_rows PostgREST.
  select sub.total_minutes::bigint
    + coalesce((select sum(delta_minutes) from public.subscription_adjustments
                where subscription_id = sub.id), 0)
    - coalesce((select sum(minutes_used) from public.sessions
                where subscription_id = sub.id), 0)
    into remaining;
  if p_minutes > remaining then
    raise exception 'Остаток % мин — списать % нельзя', remaining, p_minutes;
  end if;

  insert into public.sessions (client_id, subscription_id, minutes_used, amount,
    instructor_id, created_by, note, date)
  values (sub.client_id, sub.id, p_minutes, 0,
    p_instructor_id, p_actor_id, p_note, p_date)
  returning id into written_id;

  remaining := remaining - p_minutes;
  update public.subscriptions set status = case
    when remaining = 0 then 'used_up'::public.subscription_status
    else 'active'::public.subscription_status end
  where id = sub.id;
  return query select written_id, remaining;
end;
$$;

-- actor_id берёт сервер из getActiveAppUser, не из входящего FormData.
revoke all on function public.write_off_subscription(uuid, integer, date, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.write_off_subscription(uuid, integer, date, uuid, uuid, text)
  to service_role;
commit;
