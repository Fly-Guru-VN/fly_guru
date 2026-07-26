-- 0032: «оплату принял админ» — заявление инструктора об оплате, которой в CRM ещё нет.
-- Накатывается вручную через Supabase SQL Editor (как 0001–0031).
--
-- Пачка правок №10, п.5.
--
-- Живой сценарий: деньги за абонемент взял админ (перевод, наличные в офисе),
-- в CRM это занести забыли, а клиент уже пришёл кататься. Инструктору нужно
-- завести абонемент прямо сейчас — иначе списывать минуты не с чего, — но
-- отметить оплату он не имеет права: денег он не видел, а paid_at идёт прямо в
-- выручку месяца и в общий котёл 15%.
--
-- Поэтому оплата остаётся неотмеченной (paid_at is null), а рядом ложится
-- ЗАЯВЛЕНИЕ: кто и когда сказал, что деньги уже получены. Админ его либо
-- подтверждает кнопкой «Отметить оплату» (тогда заявление снимается), либо
-- разбирается. До подтверждения абонемент в деньгах школы не участвует.
--
-- Значения payment_claim:
--   'admin'   — «оплату принял админ, деньги у школы»
--   'unclear' — «с оплатой непонятно, надо уточнить»
alter table subscriptions
  add column if not exists payment_claim text
    check (payment_claim in ('admin', 'unclear')),
  add column if not exists payment_claim_note text,
  add column if not exists payment_claim_by uuid references users(id) on delete set null,
  add column if not exists payment_claim_at timestamptz;

-- Админу нужен быстрый ответ на «что висит неподтверждённым» — строк с
-- заявлением всегда единицы, поэтому индекс частичный.
create index if not exists subscriptions_payment_claim_idx
  on subscriptions (payment_claim)
  where payment_claim is not null;
