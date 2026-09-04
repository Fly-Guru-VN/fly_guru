-- 0053: путь фото смены обязан принадлежать строке этой же смены.
--
-- shift_photos доступна сотрудникам на insert через RLS. Политика проверяет
-- владельца shift_id, но раньше не связывала текстовый path с этим shift_id.
-- Подложенная строка могла заставить серверную чистилку (service_role) удалить
-- известный путь чужого фото. Код тоже проверяет путь, а constraint закрывает
-- первопричину на уровне БД для любого клиента API.

alter table shift_photos
  drop constraint if exists shift_photos_path_matches_row;

alter table shift_photos
  add constraint shift_photos_path_matches_row check (
    path ~ (
      '^' || shift_id::text || '/' || phase || '-' || kind || '-'
      || '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-'
      || '[0-9a-fA-F]{4}-[0-9a-fA-F]{12}[.](jpg|png|webp)$'
    )
  ) not valid;

-- NOT VALID не сканирует и не блокирует деплой из-за старых строк, но
-- Postgres уже применяет constraint ко всем новым insert/update. Старые пути
-- дополнительно fail-closed проверяют приложение и cron. После проверки
-- production-данных constraint можно отдельно VALIDATE.
