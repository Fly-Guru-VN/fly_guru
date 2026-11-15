"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveAppUser, isAdminLike, type AppRole } from "@/lib/auth";
import { EMPLOYMENT_ROLES } from "@/lib/staff";
import { checkPhoto } from "@/lib/photos";

// Аватарка сотрудника из его профиля во «Выплате зарплаты» (15.11.2026).
// Раньше фото ставил только сам человек у себя в настройках, и у половины
// штата на экране начальника были пустые кружки.
//
// Пишем service_role: на users нет политики «админ меняет чужое фото», на бакет
// avatars нет политик записи вовсе (так же устроена аватарка в кабинете
// инструктора). Поэтому сами проверяем, что вызвал действующий админ, и что
// меняем фото именно сотрудника (EMPLOYMENT_ROLES), а не админа или клиента.

export interface PhotoState {
  error: string | null;
}

export async function setStaffPhotoAction(
  _prev: PhotoState,
  formData: FormData,
): Promise<PhotoState> {
  const user = await getActiveAppUser();
  if (!user || !isAdminLike(user.role)) redirect("/login?next=/admin/payroll");

  const id = String(formData.get("id") ?? "");
  const photo = formData.get("photo");
  if (!id) return { error: "Не указан сотрудник." };
  if (!(photo instanceof File) || photo.size === 0) {
    return { error: "Выберите фото." };
  }

  const checked = await checkPhoto(photo);
  if (checked.error) return { error: checked.error };

  const admin = createAdminClient();
  const { data: target, error: readError } = await admin
    .from("users")
    .select("id, role")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { error: `Не удалось найти сотрудника: ${readError.message}` };
  if (!target || !EMPLOYMENT_ROLES.includes(target.role as AppRole)) {
    return { error: "Фото можно поставить только сотруднику." };
  }

  // Путь тот же, что у аватарки из настроек сотрудника: одна картинка на
  // человека, upsert перезаписывает. ?v= сбрасывает кеш браузера и next/image.
  const path = `${id}.${checked.ext}`;
  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, photo, { upsert: true, contentType: photo.type });
  if (uploadError) return { error: `Не удалось загрузить фото: ${uploadError.message}` };

  const { data: pub } = admin.storage.from("avatars").getPublicUrl(path);
  const { error: updateError } = await admin
    .from("users")
    .update({ photo_url: `${pub.publicUrl}?v=${Date.now()}` })
    .eq("id", id);
  if (updateError) return { error: `Не удалось сохранить фото: ${updateError.message}` };

  // Фото видно и здесь, и в кабинете самого сотрудника (шапка меню).
  revalidatePath("/", "layout");
  return { error: null };
}
