-- ============================================================================
-- 0037 — считать переходы по МЕЧЕНЫМ ссылкам, а не только по реф-ссылкам агентов
--
-- Зачем: СММщик ставит ссылки в шапку Instagram и в описание роликов на YouTube
-- и хочет видеть, сколько людей по ним пришло и сколько записалось. Метки
-- (?src=instagram, utm_*) до сих пор доезжали только вместе с ЗАЯВКОЙ — то
-- есть про тех, кто дошёл до формы. Сколько человек кликнуло и ушло, своя база
-- не знала вовсе; это видно лишь в Vercel Analytics, который режут блокировщики
-- рекламы и который ничего не знает про наши деньги.
--
-- Почему расширяем ref_visits, а не заводим новую таблицу: это ровно та же
-- сущность — «кто-то перешёл по нашей ссылке». У реф-ссылки агента метка —
-- код (/r/<code>), у рекламной — src и utm. Держать два счётчика переходов
-- в двух таблицах значит однажды сложить их по-разному на двух экранах.
-- Счётчик переходов у агентов (admin/agents) группирует по code и продолжает
-- работать как работал.
-- ============================================================================

-- code перестаёт быть обязательным: у рекламного перехода кода нет, есть src.
alter table ref_visits alter column code drop not null;

alter table ref_visits add column if not exists src  text;   -- метка канала: instagram, youtube, qr…
alter table ref_visits add column if not exists utm  jsonb not null default '{}'::jsonb;
alter table ref_visits add column if not exists path text;   -- куда именно зашёл: /, /training, /prices

comment on column ref_visits.code is 'Реф-код агента/инструктора из ссылки /r/<code>. NULL — обычная меченая ссылка.';
comment on column ref_visits.src  is 'Метка канала из ?src= (materials.src). NULL — переход по реф-ссылке.';
comment on column ref_visits.utm  is 'Остальные метки адреса: utm_source, utm_campaign, gclid, fbclid…';
comment on column ref_visits.path is 'Страница, на которую вёл переход.';

-- Экран «Источники» всегда спрашивает срез за период, отсюда индекс по дате.
create index if not exists ref_visits_src_idx        on ref_visits (src);
create index if not exists ref_visits_created_at_idx on ref_visits (created_at);

-- RLS уже включён (0003), политик нет → писать и читать может только наш
-- сервер служебным ключом. Так и оставляем: переходы пишет открытый API-роут,
-- читает админский экран.
