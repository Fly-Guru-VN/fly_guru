-- 0071: вход в кабинет клиента по одноразовой ссылке от сотрудника.
-- Накатывается вручную через Supabase SQL Editor (как 0001–0070).
--
-- Зачем. Кабинет узнаёт клиента по номеру, которым он делится в боте (0050,
-- 0056). Но у части людей Telegram заведён на другой номер, не тот, что они
-- оставили при оплате, и бот их не находит. Сотрудник выбирает такого клиента
-- в CRM и отдаёт ему личную ссылку t.me/<бот>?start=link_<код>. Человек жмёт —
-- и этот аккаунт Telegram навсегда привязан к карточке, номер не нужен.
--
-- Код одноразовый и живёт сутки: ссылку пересылают через мессенджеры, и
-- случайно попавшая к чужому человеку не должна открывать чужой абонемент
-- спустя неделю.

begin;

create table public.member_link_codes (
  code        text primary key,                                            -- случайная строка из ссылки
  client_id   uuid not null references public.clients(id) on delete cascade,
  created_by  uuid references public.users(id) on delete set null,        -- кто из сотрудников выдал
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,                                                 -- когда по ссылке зашли
  used_by     bigint                                                       -- чей telegram_id её погасил
);

create index member_link_codes_client_idx on public.member_link_codes (client_id);

-- Как и client_telegram: только сервер служебным ключом, политик нет.
alter table public.member_link_codes enable row level security;

-- Связь по ссылке телефона не имеет: человек его не присылал. А для такой
-- связи client_id — не кэш, а само решение сотрудника, и сверять его с
-- номером при каждом входе нельзя (номер как раз и не совпадает).
alter table public.client_telegram alter column phone drop not null;
alter table public.client_telegram
  add column link_source text not null default 'phone'
  check (link_source in ('phone', 'code'));

commit;
