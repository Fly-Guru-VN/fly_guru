-- 0054: уволенный сотрудник теряет права RLS даже со старой живой сессией.
--
-- Раньше приложение редиректило его из layout и не давало снова войти, но
-- app_role() продолжала возвращать прежнюю роль из users. Значит, клиент с
-- сохранённым refresh-token мог обращаться к Supabase API напрямую в обход
-- интерфейса. Server actions отдельно проверяют active user; здесь закрываем
-- второй рубеж — сам Postgres.

create or replace function public.app_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select case
      -- left_at в приложении закрывает доступ уже в указанный календарный день.
      -- Берём тот же локальный день школы, а не UTC current_date.
      when u.left_at is not null
        and u.left_at <= timezone('Asia/Ho_Chi_Minh', now())::date
        then ''
      -- Роль dev во всех политиках имеет те же права, что admin (0045).
      when u.role::text = 'dev' then 'admin'
      else u.role::text
    end
    from users u
    where u.auth_id = auth.uid()
  ), '')
$$;

grant execute on function public.app_role() to authenticated;
