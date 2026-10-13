begin;

-- Больничный инструктора (решение David от 13.10.2026).
--
-- Инструктор заболел пятого числа, а когда выздоровеет — неизвестно. Поэтому
-- больничный ОТКРЫВАЕТСЯ датой начала, а конец ставят, когда человек вышел:
--   starts_on — первый день больничного (включительно);
--   ends_on   — последний день больничного (включительно), пусто = болеет сейчас.
--
-- Что больничный меняет в деньгах:
--   • котёл абонементов: абонемент, оплаченный в день больничного, делится
--     между остальными — больной своей доли с него не получает;
--   • 15% с занятий дня: если смену в этот день никто не открыл и деньги
--     делятся между назначенными, больного среди них нет;
--   • выход 200 000 ₫ и 15% и так идут только за открытую смену, а открыть
--     смену на больничном инструктор не может (instructor/actions).
--
-- Пока только инструкторам. Фиксы СММщика и механика больничный не трогает.
create table if not exists public.sick_leaves (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  starts_on  date not null,
  ends_on    date,
  created_at timestamptz not null default now(),
  constraint sick_leaves_dates_check check (ends_on is null or ends_on >= starts_on)
);

-- Открытый больничный у человека один: второй «болеет сейчас» — это ошибка.
create unique index if not exists sick_leaves_one_open_idx
  on public.sick_leaves (user_id) where ends_on is null;

create index if not exists sick_leaves_user_idx on public.sick_leaves (user_id, starts_on);

comment on table public.sick_leaves is 'Больничные инструкторов. ends_on = последний день больничного, NULL = болеет сейчас.';

-- RLS. Читают все сотрудники: котёл абонементов считается в кабинете самого
-- инструктора, и без чужих больничных его доля вышла бы неверной (так же, как
-- даты приёма и увольнения в users). Пишет только сервер (service_role) в
-- админских действиях — как и увольнение.
alter table public.sick_leaves enable row level security;

drop policy if exists sick_leaves_select_staff on public.sick_leaves;
create policy sick_leaves_select_staff on public.sick_leaves
  for select to authenticated
  using (app_role() in ('admin', 'instructor', 'smm', 'mechanic'));

commit;
