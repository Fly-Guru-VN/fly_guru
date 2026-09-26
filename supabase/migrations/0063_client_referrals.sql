begin;

-- Рефералы: клиент приглашает друзей (задача начальника, решения David от
-- 26.09.2026).
--
--   • Приглашать может любой член клуба (memberships). Вкладку видят все
--     клиенты в Telegram-кабинете, но ссылку получает только член клуба.
--   • За каждого НОВОГО клиента, который пришёл по ссылке и оплатил первое
--     занятие или абонемент, пригласившему +20 бонусных минут. Денег нет —
--     поэтому доли Marina / 15% / CRM это не трогает вовсе.
--   • Бонусные минуты копятся отдельным балансом, не на абонементе, и
--     тратятся обычной записью с услугой «Бонусные минуты».
--   • Приглашённому +10 минут к обучению или к абонементу (считает код).
--
-- Схема на это была заложена ещё в 0001: referrer_type = 'member' и
-- reward_type = 'minutes' в referral_rewards до сих пор не использовались.
-- Награда реферала = строка referral_rewards (referrer_type 'member',
-- referrer_id = clients.id пригласившего, client_id = приглашённый,
-- reward_type 'minutes', amount = минуты). Новой таблицы не заводим.

-- ── Реф-код клиента ──────────────────────────────────────────────────────────
-- Выдаётся в кабинете при первом открытии вкладки членом клуба. Уникален в
-- своей таблице; совпадение с кодом агента или инструктора разбирает код
-- приложения (агент главнее, затем инструктор, затем клиент — lib/refOwner).
alter table public.clients add column if not exists ref_code text unique;

-- ── Одна награда за одного приглашённого ────────────────────────────────────
-- Правило «только за новых клиентов» держит сама база: даже два одновременных
-- оформления не начислят пригласившему минуты за одного друга дважды.
create unique index if not exists referral_rewards_one_per_member_client
  on public.referral_rewards (client_id)
  where referrer_type = 'member';

-- ── Услуга «Бонусные минуты» ─────────────────────────────────────────────────
-- Трата бонусных минут = обычная запись с этой услугой. Цена 0: чека нет,
-- поэтому в выручку, проценты и ЗП такая запись не попадает (суммы 0 там
-- пропускаются так же, как списания с абонемента). На сайте услуга скрыта
-- кодом (lib/services), записаться на неё гость не может.
insert into public.services (name, duration_min, price, category, code, active)
values ('Бонусные минуты', null, 0, 'rental', 'bonus-minutes', true)
on conflict (code) do nothing;

-- ── Остаток бонусных минут ──────────────────────────────────────────────────
-- Одна формула для кабинета, админки и списания: начислено наградами минус
-- потрачено записями с услугой «Бонусные минуты».
create or replace function public.bonus_minutes_left(p_client_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select sum(r.amount) from public.referral_rewards r
              where r.referrer_type = 'member'
                and r.reward_type = 'minutes'
                and r.status = 'confirmed'
                and r.referrer_id = p_client_id), 0)
    - coalesce((select sum(s.minutes_used) from public.sessions s
                join public.services sv on sv.id = s.service_id
                where sv.code = 'bonus-minutes'
                  and s.client_id = p_client_id), 0);
$$;

revoke all on function public.bonus_minutes_left(uuid) from public, anon, authenticated;
grant execute on function public.bonus_minutes_left(uuid) to service_role;

-- ── Списание бонусных минут ─────────────────────────────────────────────────
-- Как write_off_subscription (0057/0061): те же права и то же ограничение
-- инструктора «от своего имени за сегодня». Строки-баланса нет, поэтому
-- вместо блокировки строки — транзакционная блокировка по клиенту: два
-- одновременных списания не уведут баланс в минус.
create or replace function public.write_off_bonus_minutes(
  p_client_id uuid, p_minutes integer, p_date date,
  p_instructor_id uuid, p_actor_id uuid, p_note text default null
)
returns table (session_id uuid, left_minutes bigint)
language plpgsql security definer
set search_path = public
as $$
declare
  actor_role text;
  bonus_service uuid;
  remaining bigint;
  written_id uuid;
begin
  select u.role::text into actor_role from public.users u
  where u.id = p_actor_id
    and (u.left_at is null or u.left_at > timezone('Asia/Ho_Chi_Minh', now())::date);
  if actor_role is null or actor_role not in ('admin', 'dev', 'smm', 'instructor') then
    raise exception 'Нет доступа к списанию минут';
  end if;
  if p_minutes is null or p_minutes <= 0 or p_date is null or p_client_id is null then
    raise exception 'Укажите клиента, положительное целое число минут и дату';
  end if;
  if actor_role = 'instructor' and (
    p_instructor_id is distinct from p_actor_id
    or p_date <> timezone('Asia/Ho_Chi_Minh', now())::date
  ) then
    raise exception 'Инструктор может списывать только от своего имени за сегодня';
  end if;

  select id into bonus_service from public.services where code = 'bonus-minutes';
  if bonus_service is null then
    raise exception 'Услуга «Бонусные минуты» не найдена';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bonus-minutes:' || p_client_id::text, 0));

  remaining := public.bonus_minutes_left(p_client_id);
  if p_minutes > remaining then
    raise exception 'Бонусных минут % — списать % нельзя', remaining, p_minutes;
  end if;

  insert into public.sessions (client_id, service_id, minutes_used, amount,
    instructor_id, created_by, note, date)
  values (p_client_id, bonus_service, p_minutes, 0,
    p_instructor_id, p_actor_id, p_note, p_date)
  returning id into written_id;

  return query select written_id, remaining - p_minutes;
end;
$$;

-- actor_id берёт сервер из getActiveAppUser, не из входящего FormData.
revoke all on function public.write_off_bonus_minutes(uuid, integer, date, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.write_off_bonus_minutes(uuid, integer, date, uuid, uuid, text)
  to service_role;

commit;
