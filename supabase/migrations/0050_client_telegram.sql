-- 0050: связь «телеграм-аккаунт ↔ клиент» — кабинет клиента в Telegram Mini App.
-- Накатывается вручную через Supabase SQL Editor (как 0001–0049).
--
-- Зачем таблица вообще. Когда человек открывает кабинет, Telegram передаёт нам
-- только свой числовой id — телефона там нет и быть не может. Телефон человек
-- отдаёт один раз в боте кнопкой «Поделиться номером», и вот эту пару
-- (id телеграма → номер → карточка клиента) надо где-то помнить, иначе номер
-- пришлось бы спрашивать при каждом заходе.
--
-- client_id допускает NULL намеренно: номер мог не найтись среди клиентов
-- (человек нашёл бота раньше, чем пришёл кататься). Связь всё равно храним —
-- когда карточка появится, кабинет подцепится сам, без повторного вопроса.

create table if not exists client_telegram (
  telegram_id bigint primary key,                                  -- id аккаунта в Telegram
  client_id   uuid references clients(id) on delete set null,       -- карточка клиента, если нашлась
  phone       text not null,                                        -- только цифры (phoneDigits)
  username    text,                                                 -- ник без «@», если есть
  first_name  text,
  created_at  timestamptz not null default now(),
  linked_at   timestamptz                                           -- когда сошлись с карточкой клиента
);

create index if not exists client_telegram_client_idx on client_telegram (client_id);
create index if not exists client_telegram_phone_idx  on client_telegram (phone);

-- RLS включена, политик нет ни одной — и это осознанно: таблицу трогает только
-- сервер служебным ключом (service_role), который RLS обходит. Ни гость, ни
-- залогиненный сотрудник прочитать её через API не могут: в ней телефоны и
-- телеграм-аккаунты клиентов, а в кабинетах она не нужна.
alter table client_telegram enable row level security;
