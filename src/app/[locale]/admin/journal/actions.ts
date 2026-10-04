"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveAppUser, isOffice } from "@/lib/auth";
import { checkPhoto, isUuid } from "@/lib/photos";
import {
  JOURNAL_BUCKET,
  TITLE_MAX,
  contentChanged,
  coverPath,
  isJournalPhotoPath,
  parseBody,
  slugWithSuffix,
  slugify,
  type JournalStatus,
} from "@/lib/journal";

// Журнал: запись постов и фото (0064).
//
// Пишут админ, разработчик и СММщик. Всё — служебным ключом и только после
// getActiveAppUser: у таблиц журнала нет политик на запись вовсе, поэтому
// своим ключом мимо этих функций не изменить ничего, а уволенный со старой
// живой сессией сюда не пройдёт.
//
// Действия вызываются из редактора напрямую (не формой) и возвращают
// результат, а не делают redirect: редактор остаётся на месте и показывает
// «сохранено» — на телефоне перезагрузка страницы посреди статьи раздражает.

async function requireOffice() {
  const user = await getActiveAppUser();
  if (!user || !isOffice(user.role)) redirect("/login?next=/admin");
  return user;
}

// После любой записи: лента журнала, страница поста и карта сайта. Пути с
// языковым префиксом сбрасывает общий layout — как у остальных правок сайта.
function refreshJournal() {
  revalidatePath("/", "layout");
  revalidatePath("/sitemap.xml");
}

// ── Фото ─────────────────────────────────────────────────────────────────────
// Каждое фото уходит отдельным запросом сразу после выбора, уже сжатым в
// браузере (lib/imageCompress): так в лимит тела server action (5 МБ)
// укладывается любой снимок с телефона, а статья с десятком фото не
// превращается в один гигантский запрос.

export type UploadPhotoResult =
  | { path: string; w: number; h: number; error?: undefined }
  | { error: string };

function side(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 10_000 ? n : null;
}

export async function uploadJournalPhotoAction(formData: FormData): Promise<UploadPhotoResult> {
  await requireOffice();

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return { error: "Фото не выбрано." };
  const checked = await checkPhoto(photo);
  if (checked.error) return { error: checked.error };

  // Размеры кадра нужны странице, чтобы зарезервировать место под фото и текст
  // не прыгал при загрузке. Меряет их браузер — на сервере декодера нет.
  const w = side(formData.get("w"));
  const h = side(formData.get("h"));
  if (!w || !h) return { error: "Не удалось определить размер фото." };

  const path = `${new Date().getUTCFullYear()}/${randomUUID()}.${checked.ext}`;
  const { error } = await createAdminClient()
    .storage.from(JOURNAL_BUCKET)
    .upload(path, photo, { contentType: photo.type, upsert: false });
  if (error) return { error: `Не удалось загрузить фото: ${error.message}` };

  return { path, w, h };
}

// ── Сохранение ───────────────────────────────────────────────────────────────

export interface SavePostInput {
  id: string | null;
  title: string;
  body: unknown;
  categoryId: string | null;
  // save — сохранить, не меняя статуса; publish — опубликовать (или вернуть
  // скрытый); hide — снять с публикации.
  intent: "save" | "publish" | "hide";
}

export type SavePostResult =
  | {
      error?: undefined;
      id: string;
      slug: string;
      status: JournalStatus;
      savedAt: string;
    }
  | { error: string };

interface StoredPost {
  id: string;
  slug: string;
  title: string;
  body: unknown;
  status: JournalStatus;
  published_at: string | null;
  edited_at: string | null;
}

type Admin = ReturnType<typeof createAdminClient>;

// Свободный адрес: сам base, а если занят — base-2, base-3… Свой же пост
// (при пересохранении черновика) занятым не считается.
async function freeSlug(admin: Admin, base: string, ownId: string | null): Promise<string> {
  const { data, error } = await admin
    .from("journal_posts")
    .select("id, slug")
    .like("slug", `${base}%`);
  if (error) throw new Error(`[journal] не удалось проверить адрес: ${error.message}`);
  const taken = new Set(
    (data ?? []).filter((row) => row.id !== ownId).map((row) => row.slug as string),
  );
  for (let n = 1; ; n++) {
    const candidate = slugWithSuffix(base, n);
    if (!taken.has(candidate)) return candidate;
  }
}

export async function saveJournalPostAction(input: SavePostInput): Promise<SavePostResult> {
  const user = await requireOffice();

  const title = String(input.title ?? "").trim();
  if (!title) return { error: "Добавьте заголовок." };
  if (title.length > TITLE_MAX) return { error: `Заголовок длиннее ${TITLE_MAX} символов.` };

  const body = parseBody(input.body);
  if (input.intent === "publish" && body.length === 0) {
    return { error: "Добавьте текст или фото — пустой пост опубликовать нельзя." };
  }

  const categoryId = input.categoryId || null;
  if (categoryId && !isUuid(categoryId)) return { error: "Категория не найдена." };

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const fields = {
    title,
    body,
    cover_path: coverPath(body),
    category_id: categoryId,
    updated_by: user.id,
    updated_at: now,
  };

  // ── Новый пост ──
  if (!input.id) {
    if (input.intent === "hide") return { error: "Черновик и так не виден на сайте." };
    const status: JournalStatus = input.intent === "publish" ? "published" : "draft";
    const base = slugify(title);
    // Два офисных сотрудника могут одновременно создать посты с одинаковым
    // заголовком: уникальность адреса держит база, мы лишь берём следующий
    // свободный номер и пробуем ещё раз.
    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = await freeSlug(admin, base, null);
      const { data, error } = await admin
        .from("journal_posts")
        .insert({
          ...fields,
          slug,
          status,
          created_by: user.id,
          published_at: status === "published" ? now : null,
        })
        .select("id")
        .single();
      if (!error) {
        refreshJournal();
        return { id: data.id as string, slug, status, savedAt: now };
      }
      if (error.code !== "23505") return { error: `Не удалось сохранить: ${error.message}` };
    }
    return { error: "Не удалось подобрать адрес поста — попробуйте ещё раз." };
  }

  // ── Существующий пост ──
  if (!isUuid(input.id)) return { error: "Пост не найден." };
  const { data: stored, error: readError } = await admin
    .from("journal_posts")
    .select("id, slug, title, body, status, published_at, edited_at")
    .eq("id", input.id)
    .maybeSingle();
  if (readError) return { error: `Не удалось прочитать пост: ${readError.message}` };
  if (!stored) return { error: "Пост не найден — возможно, его удалили." };
  const post = stored as StoredPost;

  let status = post.status;
  if (input.intent === "publish") status = "published";
  if (input.intent === "hide") {
    if (post.status === "draft") return { error: "Черновик и так не виден на сайте." };
    status = "hidden";
  }

  const everPublished = post.published_at !== null;
  // Адрес следует за заголовком, пока пост ни разу не публиковался. После
  // первой публикации он заморожен: ссылка уже могла уйти в чаты и поисковик.
  const slug =
    !everPublished && title !== post.title
      ? await freeSlug(admin, slugify(title), post.id)
      : post.slug;
  // «Изменено» — только правка текста уже опубликованного поста.
  const editedAt =
    everPublished && contentChanged(post, { title, body }) ? now : post.edited_at;

  const { error } = await admin
    .from("journal_posts")
    .update({
      ...fields,
      slug,
      status,
      published_at: post.published_at ?? (status === "published" ? now : null),
      edited_at: editedAt,
    })
    .eq("id", post.id);
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Такой адрес только что занял другой пост — сохраните ещё раз."
          : `Не удалось сохранить: ${error.message}`,
    };
  }

  refreshJournal();
  return { id: post.id, slug, status, savedAt: now };
}

// ── Удаление черновика ───────────────────────────────────────────────────────
// Удалить можно только черновик: опубликованный пост сначала скрывают. Так
// случайное нажатие не уничтожит статью, на которую уже ведут ссылки.
// Фото черновика удаляются вместе с ним.
export async function deleteJournalDraftAction(id: string): Promise<{ error: string | null }> {
  await requireOffice();
  if (!isUuid(id)) return { error: "Пост не найден." };

  const admin = createAdminClient();
  const { data: post, error: readError } = await admin
    .from("journal_posts")
    .select("id, status, body")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { error: `Не удалось прочитать пост: ${readError.message}` };
  if (!post) return { error: null };
  if (post.status !== "draft") {
    return { error: "Опубликованный пост не удаляется — его можно скрыть." };
  }

  const { error } = await admin
    .from("journal_posts")
    .delete()
    .eq("id", id)
    .eq("status", "draft");
  if (error) return { error: `Не удалось удалить: ${error.message}` };

  const photos = parseBody(post.body)
    .map((block) => (block.type === "photo" ? block.path : null))
    .filter(isJournalPhotoPath);
  if (photos.length > 0) {
    // Не удалилось фото — не беда: черновика уже нет, а файл без ссылок на
    // него никому не виден. Пишем в лог и не пугаем пользователя.
    const { error: removeError } = await admin.storage.from(JOURNAL_BUCKET).remove(photos);
    if (removeError) console.error("[journal] фото черновика не удалены:", removeError.message);
  }

  return { error: null };
}
