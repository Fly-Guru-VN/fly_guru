import { createAdminClient } from "@/lib/supabase/admin";
import { isClientPhotoStoragePath, isUuid } from "@/lib/photos";

// Только серверный код: подпись создаётся service_role-ключом и никогда не
// должна вызываться из Client Component. Сама ссылка живёт недолго, а список
// доступных объектов перед этим ограничивает обычный запрос пользователя/RLS.
export type PrivatePhotoBucket = "clients" | "shifts";

export const PRIVATE_PHOTO_URL_TTL_SECONDS = 15 * 60;

/**
 * Возвращает путь объекта, предпочитая новую колонку. Legacy public URL нужен
 * на переходный период и для строк, которые были записаны до миграции 0052.
 * Чужой URL или ссылка другого бакета путём не считаются.
 */
export function privatePhotoPath(
  bucket: PrivatePhotoBucket,
  storedPath: string | null | undefined,
  legacyPublicUrl?: string | null,
): string | null {
  const path = storedPath?.trim();
  if (path && !path.includes("://")) return path.replace(/^\/+/, "");

  const legacy = legacyPublicUrl?.trim();
  if (!legacy) return null;

  const marker = `/storage/v1/object/public/${bucket}/`;
  try {
    const url = new URL(legacy);
    const at = url.pathname.indexOf(marker);
    if (at < 0) return null;
    const extracted = url.pathname.slice(at + marker.length).replace(/^\/+/, "");
    return extracted || null;
  } catch {
    return null;
  }
}

/** Создаёт один батч короткоживущих ссылок и индексирует их по пути. */
export async function createPrivatePhotoUrls(
  bucket: PrivatePhotoBucket,
  paths: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const urls = new Map<string, string>();
  if (uniquePaths.length === 0) return urls;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrls(uniquePaths, PRIVATE_PHOTO_URL_TTL_SECONDS);

  if (error) {
    console.error(`[storage] ${bucket} signed URLs error:`, error.message);
    return urls;
  }

  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) {
      urls.set(item.path, item.signedUrl);
    } else if (item.path && item.error) {
      console.error(`[storage] ${bucket}/${item.path} sign error:`, item.error);
    }
  }
  return urls;
}

/**
 * Атомарная насколько позволяет связка DB + Storage замена фото клиента.
 * Сначала создаём объект под новым уникальным именем, затем переключаем на
 * него строку БД и только после этого удаляем прежний объект. Поэтому ошибка
 * на любом основном шаге не ломает уже работавшее фото.
 */
export async function replacePrivateClientPhoto(
  clientId: string,
  photo: File,
  ext: string,
): Promise<{ error: string | null }> {
  if (!isUuid(clientId) || !["jpg", "png", "webp"].includes(ext)) {
    return { error: "Клиент не найден." };
  }

  const admin = createAdminClient();
  const { data: client, error: readError } = await admin
    .from("clients")
    .select("id, photo_path, photo_url")
    .eq("id", clientId)
    .maybeSingle();
  if (readError) {
    return { error: `Не удалось проверить клиента: ${readError.message}` };
  }
  if (!client) return { error: "Клиент не найден." };

  const path = `${clientId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from("clients")
    .upload(path, photo, { contentType: photo.type });
  if (uploadError) {
    return { error: `Не удалось загрузить фото: ${uploadError.message}` };
  }

  const { data: updated, error: updateError } = await admin
    .from("clients")
    .update({ photo_path: path })
    .eq("id", clientId)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    const { error: cleanupError } = await admin.storage.from("clients").remove([path]);
    if (cleanupError) {
      console.error(`[storage] orphan client photo ${path}:`, cleanupError.message);
    }
    return {
      error: `Не удалось сохранить фото: ${updateError?.message ?? "клиент исчез"}`,
    };
  }

  const previousPath = privatePhotoPath(
    "clients",
    client.photo_path as string | null,
    client.photo_url as string | null,
  );
  if (
    previousPath &&
    previousPath !== path &&
    isClientPhotoStoragePath(clientId, previousPath)
  ) {
    const { error: cleanupError } = await admin.storage
      .from("clients")
      .remove([previousPath]);
    if (cleanupError) {
      // Новое фото уже сохранено и привязано. Не выдаём успешную замену за
      // ошибку пользователю, но оставляем точный путь для уборки в логах.
      console.error(`[storage] old client photo ${previousPath}:`, cleanupError.message);
    }
  }

  return { error: null };
}
