"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getActiveAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createBooking } from "@/lib/bookings";
import { getAgentProfile } from "@/lib/agentCabinet";
import { PHONE_ERROR } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPhoto } from "@/lib/photos";
import type { ActionState } from "../instructor/actions";

// Server actions кабинета агента: правка своего профиля и запись гостя.
// Всё остальное в кабинете — только чтение.

// Свой профиль правит сам агент; админ, заглянувший в кабинет, чужой профиль
// отсюда не меняет — экшен всегда пишет в строку залогиненного.
async function requireAgent() {
  const user = await getActiveAppUser();
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
    const checked = await checkPhoto(photo);
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

// ── Записать гостя (25.08.2026) ──────────────────────────────────────────────
//
// Зачем вкладка. Раньше атрибуция держалась ТОЛЬКО на ссылке: гость, который
// пришёл сам и на словах сказал «я от Хунга», попадал в CRM без реф-кода — ни
// скидки ему, ни награды агенту, и разбирались с этим вручную через начальника.
// Гиды и отельеры оформляют гостя за стойкой, а не переписываются с ним
// ссылками, поэтому заявку они теперь заводят сами.
//
// Реф-код берётся ИЗ БАЗЫ по залогиненному агенту, а не из формы: подставить
// чужой код нельзя даже подделанным запросом. Всё остальное — общие правила
// заявки (lib/bookings), те же, что у формы на сайте.
export async function createAgentBookingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAgent();

  const supabase = await createClient();
  const profile = await getAgentProfile(supabase, user.id);
  if (!profile) {
    return { error: "К вашему аккаунту не привязана агентская ссылка." };
  }
  // Выключенному агенту награда не начисляется (так же, как по его ссылке), и
  // молча завести заявку «как будто всё в порядке» было бы обманом.
  if (!profile.active) {
    return { error: "Ваша ссылка выключена — напишите начальнику школы." };
  }

  const result = await createBooking({
    clientName: String(formData.get("clientName") ?? ""),
    contact: String(formData.get("contact") ?? ""),
    telegram: String(formData.get("telegram") ?? "") || null,
    messenger: String(formData.get("messenger") ?? "") || null,
    serviceId: String(formData.get("serviceId") ?? "") || null,
    preferredDate: String(formData.get("preferredDate") ?? "") || null,
    comment: String(formData.get("comment") ?? "") || null,
    refCode: profile.refCode,
    // Откуда пришла заявка: в «Источниках» такие видно отдельно от заявок с
    // сайта по той же ссылке — агент записал гостя руками.
    src: "agent-cabinet",
  });

  if (!result.ok) {
    if (result.error === "missing_fields") {
      return { error: "Заполните имя и телефон гостя." };
    }
    if (result.error === "bad_phone") return { error: PHONE_ERROR };
    return { error: "Не удалось записать заявку. Попробуйте ещё раз." };
  }

  // Заявка попадёт в его же воронку на «Статистике».
  revalidatePath("/", "layout");
  redirect(`/agent/record?done=${result.bookingNo ?? ""}`);
}
