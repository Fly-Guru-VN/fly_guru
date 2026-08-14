-- 0045: для защиты данных dev — это админ.
-- Накатывается вручную через Supabase SQL Editor, ПОСЛЕ 0044.
--
-- Задача: дать роли dev ровно те же права, что у админа. Прямой путь —
-- переписать все политики с «app_role() = 'admin'» на «app_role() in
-- ('admin','dev')». Таких мест 49 в полутора десятках файлов; каждое —
-- отдельный шанс промахнуться и тихо открыть или закрыть лишнее.
--
-- Поэтому переводим одну функцию, через которую и так судят ВСЕ политики:
-- app_role() отвечает 'admin', когда в базе у человека роль 'dev'. Все 49
-- политик начинают пускать разработчика как админа, ни одной не тронув.
--
-- ⚠️ Следствие, которое надо помнить: в SQL отличить dev от админа через
-- app_role() уже нельзя. Если однажды понадобится политика ИМЕННО для
-- разработчика (или ИМЕННО для админа) — читать роль напрямую:
--     (select role::text from users where auth_id = auth.uid()) = 'dev'
-- Приложение (middleware, getAppUser, расчёт ЗП) видит настоящую роль: оно
-- читает users.role само и про эту подмену не знает.

create or replace function public.app_role()
returns text
language sql stable security definer
set search_path = public
as $$
  -- role — enum user_role, поэтому приводим к тексту (см. 0026: иначе coalesce
  -- падает на 22P02). Сравниваем тоже как текст — так значение enum 'dev' не
  -- упоминается литералом и файл безопасно катится сразу после 0044.
  select case when r = 'dev' then 'admin' else r end
  from (
    select coalesce((select role::text from users where auth_id = auth.uid()), '') as r
  ) t
$$;

grant execute on function public.app_role() to authenticated;
