"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPhoto } from "@/lib/photos";
import type { ActionState } from "../instructor/actions";

// Server actions кабинета агента. Пока он ровно один: агент правит свой
// профиль. Всё остальное в кабинете — только чтение.

// Свой профиль правит сам агент; админ, заглянувший в кабинет, чужой профиль
// отсюда не меняет — экшен всегда пишет в строку залогиненного.
async function requireAgent() {
  const user = await getAppUser();
  if (!user || user.role !== "agent") redirect("/login?next=/agent");
  return user;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function updateAgentProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAgent();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Имя не может быть пустым." };

  // Дата рождения (0049). Пустое поле — «не указана», это нормально.
  const birthdayRaw = String(formData.get("birthday") ?? "").trim();
  let birthday: string | null = null;
  if (birthdayRaw) {
    if (!DAY_RE.test(birthdayRaw)) return { error: "Дата рождения указана неверно." };
    const year = Number(birthdayRaw.slice(0, 4));
    const now = new Date().getUTCFullYear();
    // Опечатка в году (1092 вместо 1992) иначе молча уедет в базу и всплывёт
    // через полгода в поздравлении.
    if (year < 1900 || year > now) {
      return { error: "Проверьте год рождения." };
    }
    birthday = birthdayRaw;
  }

  const patch: Record<string, unknown> = { name, birthday };

  // На users нет политики «обновить свою строку» (и на бакет avatars нет
  // политик записи) — профиль сознательно меняется только через сервер, как и
  // у сотрудников (см. instructor/actions → updateProfileAction). Пишем под
  // service_role, но строго в строку залогиненного.
  const admin = createAdminClient();

  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const checked = checkPhoto(photo);
    if (checked.error) return { error: checked.error };

    const path = `${user.id}.${checked.ext}`;
    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(path, photo, { upsert: true, contentType: photo.type });
    if (uploadError) {
      return { error: `Не удалось загрузить фото: ${uploadError.message}` };
    }

    const { data: pub } = admin.storage.from("avatars").getPublicUrl(path);
    patch.photo_url = `${pub.publicUrl}?v=${Date.now()}`;
  }

  const { error: updateError } = await admin
    .from("users")
    .update(patch)
    .eq("id", user.id);
  if (updateError) return { error: `Не удалось сохранить: ${updateError.message}` };

  // Имя и фото стоят в карточке профиля бокового меню — обновляем весь макет.
  revalidatePath("/", "layout");
  return { error: null };
}
