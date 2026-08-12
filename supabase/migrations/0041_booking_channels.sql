-- ============================================================================
-- 0041 — справочник «Каналы записи» (пачка №26, п.4).
-- Накатывается вручную через Supabase SQL Editor (как 0001–0040).
--
-- Было: шесть каналов лежали КОНСТАНТОЙ в коде (src/lib/channels.ts), а
-- рекламные каналы — строками в materials. Два списка про одно и то же: чтобы
-- записать гостя «из инстаграма», админ каждый раз выбирал «Другой…» и вбивал
-- «instagram» руками. Отсюда разнобой в написании и лишний труд.
--
-- Стало: обычный справочник админа — как payment_methods и expense_categories
-- (0016). Устройство то же (name + active), поэтому экшены, компонент
-- управления и getActiveDict/getFullDict переиспользуются целиком.
--
-- Значение по-прежнему хранится ТЕКСТОМ в bookings.src и sessions.channel —
-- ссылкой на справочник его сделать нельзя: в той же колонке живут метки
-- рекламных ссылок (?src=instagram) и свободный текст пункта «Другой…».
-- Поэтому справочник хранит имя, а не ключ, и старые ключевые значения
-- (beach, walkin…) миграция переводит на имена — иначе одна и та же «Пляжи»
-- разъехалась бы во вкладке «Источники» на две строки.
-- ============================================================================

create table if not exists booking_channels (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table booking_channels is
  'Каналы записи для форм заявки и записи клиента. Значение хранится текстом в bookings.src / sessions.channel.';

-- ── Стартовый набор ─────────────────────────────────────────────────────────
-- 1. Те шесть, что были константой: список не должен опустеть после наката.
insert into booking_channels (name) values
  ('Пляжи'),
  ('Звонок'),
  ('WhatsApp'),
  ('Telegram'),
  ('Пришёл сам'),
  ('Постоянный клиент')
on conflict (name) do nothing;

-- 2. Рекламные каналы из «Материалов» (Instagram, YouTube, QR…): ради них всё
-- и затевалось — канал заведён один раз для ссылки и сразу есть в форме.
insert into booking_channels (name)
select distinct trim(label)
from materials
where trim(coalesce(label, '')) <> ''
on conflict (name) do nothing;

-- ── Старые значения: ключ → имя ─────────────────────────────────────────────
-- Точечно, только по шести известным ключам. Всё остальное в этих колонках —
-- метки ссылок (instagram, gads) и свободный текст: их не трогаем.
update bookings set src = case src
    when 'beach'    then 'Пляжи'
    when 'call'     then 'Звонок'
    when 'whatsapp' then 'WhatsApp'
    when 'telegram' then 'Telegram'
    when 'walkin'   then 'Пришёл сам'
    when 'repeat'   then 'Постоянный клиент'
  end
where src in ('beach', 'call', 'whatsapp', 'telegram', 'walkin', 'repeat');

update sessions set channel = case channel
    when 'beach'    then 'Пляжи'
    when 'call'     then 'Звонок'
    when 'whatsapp' then 'WhatsApp'
    when 'telegram' then 'Telegram'
    when 'walkin'   then 'Пришёл сам'
    when 'repeat'   then 'Постоянный клиент'
  end
where channel in ('beach', 'call', 'whatsapp', 'telegram', 'walkin', 'repeat');

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Читают все, у кого есть форма записи (инструктор, механик, СММщик, админ);
-- ведёт список только админ — как у двух других справочников.
alter table booking_channels enable row level security;

create policy booking_channels_select_staff on booking_channels
  for select to authenticated
  using (app_role() in ('instructor', 'mechanic', 'smm', 'admin'));

create policy booking_channels_admin_all on booking_channels
  for all to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');
