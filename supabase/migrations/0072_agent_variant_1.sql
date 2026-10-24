-- 0072: агенты возвращаются — тариф «Вариант 1» и агент на абонементе.
-- Накатывается вручную через Supabase SQL Editor (как 0001–0071).
--
-- ── Зачем ────────────────────────────────────────────────────────────────────
-- 24.10.2026 начальник вернул агентов и договорился с первым на особых
-- условиях («Вариант 1», числа — в src/lib/agentTerms.ts):
--
--   услуга      клиент платит      агенту     база процентов школы
--   базовое     2 млн − 300к       200 000    1 500 000  (чек − агенту)
--   парное      3,5 млн − 300к     300 000    2 900 000  (чек − агенту)
--   абонемент   6 млн − 300к       600 000    5 000 000  (чек − 700 000)
--
-- Платим только за НОВОГО клиента — того, кто раньше у нас ничего не покупал.
--
-- До сих пор агент зарабатывал только на занятиях: комиссия жила в
-- sessions.agent_commission, и с чека минус она считались 35% Marina, 15% и 2%
-- CRM. Абонементы шли в базу процентов целиком. Теперь у абонемента тоже есть
-- агент, поэтому ему нужны свои две цифры:
--
--   agent_commission — сколько школа должна агенту за эту продажу (600 000);
--   agent_base_cut   — сколько снять с цены, прежде чем считать проценты
--                      школы (700 000: так договорено «Марине с 5 млн»). У
--                      занятий это одно число, у абонемента — разные.
--
-- Обе цифры пишутся в момент продажи и потом не пересчитываются: сменили
-- агенту тариф — старые продажи остаются как были (то же правило, что у
-- sessions.agent_commission).
--
-- subscription_extensions получает agent_base_cut только ради общего чтения:
-- lib/subscriptionExtensions читает обе таблицы ОДНИМ списком колонок. У
-- продления агента не бывает — колонка всегда 0.
--
-- ⚠️ НАКАТЫВАТЬ ДО ДЕПЛОЯ: расчёт выручки читает agent_base_cut без страховки,
-- и код раньше миграции уронит «Статистику», «Выплаты» и отчёт дня.

begin;

alter table public.agents drop constraint if exists agents_terms_plan_check;
alter table public.agents
  add constraint agents_terms_plan_check
  check (terms_plan in ('standard', 'pct-20', 'variant-1'));

comment on column public.agents.terms_plan is
  'Тариф агента: standard | pct-20 | variant-1. Числа — в src/lib/agentTerms.ts';

alter table public.subscriptions
  add column if not exists agent_commission bigint not null default 0
    check (agent_commission >= 0),
  add column if not exists agent_base_cut bigint not null default 0
    check (agent_base_cut >= 0);

comment on column public.subscriptions.agent_commission is
  'Сколько школа должна агенту за эту продажу (0 — без агента). Фиксируется при продаже';
comment on column public.subscriptions.agent_base_cut is
  'Сколько снять с цены перед 35% Marina, 15% и 2% CRM (0 — без агента)';

alter table public.subscription_extensions
  add column if not exists agent_base_cut bigint not null default 0
    check (agent_base_cut = 0);

comment on column public.subscription_extensions.agent_base_cut is
  'Всегда 0: у продления агента нет. Колонка нужна общему чтению с subscriptions';

commit;
