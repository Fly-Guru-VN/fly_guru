begin;

-- Продление абонемента за доплату (ответ начальника от 17.09.2026, решения
-- David от 22.09.2026): 1 000 000 ₫ — и срок действующего абонемента
-- сдвигается на 3 месяца. Сгоревший (истёкший, откатанный, отменённый)
-- продлить нельзя. Продлевают админ и инструктор.
--
-- Деньги продления считаются РОВНО как продажа абонемента: 35% Marina, 2% CRM,
-- 15% в котёл сменщиков дня оплаты (продажа босса — только с галочкой
-- pool_share, 0048). Поэтому колонки названы так же, как в subscriptions
-- (price, paid_at, sold_by, pool_share, payment_method_id): денежные экраны
-- читают обе таблицы одним помощником (lib/subscriptionExtensions).
--
-- Бонусные +30 минут к продлению пока НЕ начисляются — ждут уточнения у
-- начальника.
create table if not exists public.subscription_extensions (
  id                uuid primary key default gen_random_uuid(),
  subscription_id   uuid not null references public.subscriptions(id) on delete cascade,
  price             bigint not null check (price > 0),
  -- Продление оплачивается сразу, на месте: отдельного «ждёт оплаты» нет.
  paid_at           timestamptz not null default now(),
  payment_method_id uuid not null references public.payment_methods(id),
  sold_by           uuid not null references public.users(id),
  pool_share        boolean not null default false,
  expires_before    timestamptz not null,
  expires_after     timestamptz not null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_subscription_extensions_paid_at
  on public.subscription_extensions (paid_at);
create index if not exists idx_subscription_extensions_subscription
  on public.subscription_extensions (subscription_id);

alter table public.subscription_extensions enable row level security;

-- Читают те же, кто видит абонементы (0040). Пишет только функция ниже.
create policy subscription_extensions_select_staff on public.subscription_extensions
  for select to authenticated
  using (app_role() in ('instructor', 'smm', 'admin'));

-- Блокировка строки абонемента сериализует продление со списанием и с
-- повторным нажатием: второй запрос увидит уже сдвинутый срок, а не старый.
create function public.extend_subscription(
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
    -- Галочка котла — только у продажи босса (0048); у полевого состава
    -- котёл считается по факту, флаг ни на что не влияет.
    coalesce(p_pool_share, false) and actor_role in ('admin', 'dev'),
    sub.expires_at, new_expiry);

  return new_expiry;
end;
$$;

-- actor_id берёт сервер из getActiveAppUser, не из входящего FormData.
revoke all on function public.extend_subscription(uuid, integer, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.extend_subscription(uuid, integer, uuid, uuid, boolean)
  to service_role;

commit;
