-- 0052: приватные фото клиентов и смен.
--
-- UUID в имени объекта не является контролем доступа: постоянную публичную
-- ссылку можно переслать, сохранить в истории или вытащить из логов. Поэтому
-- служебные фото остаются доступны только через короткоживущие signed URL,
-- которые сервер выдаёт уже после проверки кабинета и RLS.

-- Для клиента храним канонический путь внутри бакета. Старый photo_url пока
-- оставляем для безопасного отката и как источник миграции существующих строк;
-- новый код его наружу не отдаёт.
alter table clients add column if not exists photo_path text;

update clients
set photo_path = split_part(
  split_part(photo_url, '/storage/v1/object/public/clients/', 2),
  '?',
  1
)
where photo_path is null
  and position('/storage/v1/object/public/clients/' in photo_url) > 0;

comment on column clients.photo_path is
  'Путь объекта в приватном Storage bucket clients; URL подписывается сервером при чтении.';
comment on column clients.photo_url is
  'Legacy public URL до 0052; не использовать для отображения новых данных.';

-- У фото смен путь уже был отдельной колонкой. url становится legacy-полем:
-- новые строки сохраняют только path, а ссылка создаётся на время просмотра.
alter table shift_photos alter column url drop not null;
comment on column shift_photos.url is
  'Legacy public URL до 0052; новые строки хранят только path.';

-- Аватары сотрудников остаются публичными намеренно: это профильные фото.
-- Персональные фото клиентов и операционные снимки смен закрываем.
update storage.buckets
set public = false
where id in ('clients', 'shifts');
