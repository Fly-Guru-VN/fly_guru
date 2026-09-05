begin;

-- Ключ идентичности, НЕ нечёткий поиск CRM. Страну по хвосту не угадываем.
-- Поддерживаем полный международный номер (+ / 00 / цифры) и явно локальный
-- вьетнамский мобильный 0xxxxxxxxx. Неоднозначные короткие номера не дополняем.
create function public.member_phone_key(raw_phone text)
returns text language plpgsql immutable strict
set search_path = public
as $$
declare digits text;
begin
  if btrim(raw_phone) !~ '^\+?[0-9() .[:space:]-]+$' then return null; end if;
  digits := regexp_replace(raw_phone, '[^0-9]', '', 'g');
  if left(btrim(raw_phone), 1) <> '+' then
    if left(digits, 2) = '00' then
      digits := substr(digits, 3);
    elsif digits ~ '^0[35789][0-9]{8}$' then
      digits := '84' || substr(digits, 2);
    end if;
  end if;
  if digits !~ '^[1-9][0-9]{7,14}$' then return null; end if;
  return digits;
end;
$$;

alter table public.clients add column member_phone_key text
  generated always as (public.member_phone_key(phone)) stored;
create index clients_member_phone_key_idx on public.clients (member_phone_key)
  where member_phone_key is not null;

-- Дубликаты сохраняем, но кабинет при двух совпадениях отказывает в доступе.
-- Два результата нужны именно для обнаружения неоднозначности, не limit(1).
create function public.find_member_client_by_phone(p_phone text)
returns table (id uuid, name text)
language sql stable security definer
set search_path = public
as $$
  select c.id, c.name from public.clients c
  where c.member_phone_key = public.member_phone_key(p_phone)
  limit 2
$$;
revoke all on function public.find_member_client_by_phone(text) from public, anon, authenticated;
grant execute on function public.find_member_client_by_phone(text) to service_role;

commit;
