begin;

-- Бонус +30 минут к продлению абонемента (ответ начальника от 17.09.2026,
-- подтверждено David 07.10.2026). В 0062 бонус был отложен.
--
-- Минуты кладём на сам абонемент поправкой (subscription_adjustments) с
-- комментарием — так же, как бонус другу по реферальной ссылке (0063):
-- остаток её учитывает, в истории абонемента видно, откуда минуты, и
-- сгорают они вместе с абонементом. Поправка пишется в той же транзакции,
-- что и сдвиг срока: продления без минут (и минут без продления) не бывает.
create or replace function public.extend_subscription(
  p_subscription_id uuid, p_price integer, p_payment_method_id uuid,
  p_actor_id uuid, p_pool_share boolean default false
)
returns timestamptz
language plpgsql security definer
set search_path = public
as $$
declare
  actor_role text;
  sub public.subscriptions%rowtype;
  new_expiry timestamptz;
begin
  select u.role::text into actor_role from public.users u
  where u.id = p_actor_id
    and (u.left_at is null or u.left_at > timezone('Asia/Ho_Chi_Minh', now())::date);
  if actor_role is null or actor_role not in ('admin', 'dev', 'smm', 'instructor') then
    raise exception 'Нет доступа к продлению абонемента';
  end if;
  if p_price is null or p_price <= 0 then
    raise exception 'Цена продления должна быть больше нуля';
  end if;
  if p_payment_method_id is null then
    raise exception 'Укажите формат оплаты';
  end if;

  select * into sub from public.subscriptions
    where id = p_subscription_id for update;
  if not found then raise exception 'Абонемент не найден'; end if;
  if sub.status <> 'active' or sub.expires_at is null or sub.expires_at <= now() then
    raise exception 'Абонемент не действует — продлить можно только действующий';
  end if;

  new_expiry := sub.expires_at + interval '3 months';
  update public.subscriptions set expires_at = new_expiry where id = sub.id;

  insert into public.subscription_extensions (subscription_id, price,
    payment_method_id, sold_by, pool_share, expires_before, expires_after)
  values (sub.id, p_price, p_payment_method_id, p_actor_id,
    coalesce(p_pool_share, false) and actor_role in ('admin', 'dev'),
    sub.expires_at, new_expiry);

  insert into public.subscription_adjustments (subscription_id, delta_minutes,
    comment, created_by)
  values (sub.id, 30, 'Бонус за продление', p_actor_id);

  return new_expiry;
end;
$$;

-- create or replace сохраняет права из 0062, но повторяем явно.
revoke all on function public.extend_subscription(uuid, integer, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.extend_subscription(uuid, integer, uuid, uuid, boolean)
  to service_role;

-- Продления до этой миграции прошли без бонуса (на 07.10.2026 одно — Раиль).
-- Доначисляем по одной поправке на каждое продление, датой продления и от
-- имени продлившего. Повторный прогон ничего не задвоит: пропускаем
-- продления, у которых бонус уже есть.
insert into public.subscription_adjustments (subscription_id, delta_minutes,
  comment, created_by, created_at)
select e.subscription_id, 30, 'Бонус за продление', e.sold_by, e.paid_at
from public.subscription_extensions e
where not exists (
  select 1 from public.subscription_adjustments a
  where a.subscription_id = e.subscription_id
    and a.comment = 'Бонус за продление'
    and a.created_at = e.paid_at
);

commit;
