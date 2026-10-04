"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveAppUser, isOffice } from "@/lib/auth";
import { checkPhoto, isUuid } from "@/lib/photos";
import { pingIndexNow } from "@/lib/indexNow";
import { SITE_URL } from "@/lib/site";
import {
  JOURNAL_BUCKET,
  SLUG_MAX,
  TITLE_MAX,
  contentChanged,
  coverPath,
  isJournalPhotoPath,
  parseBody,
  safeHref,
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

// Пост появился, изменился или пропал с сайта — сообщаем Bing и Яндексу
// (lib/indexNow). После ответа, а не до: человеку в кабинете незачем ждать
// чужой сервер, а к этому моменту кэш страниц уже сброшен.
function announce(slug: string) {
  after(() => pingIndexNow([`${SITE_URL}/journal/${slug}`, `${SITE_URL}/journal`]));
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
  // «Дополнительно» в редакторе. Пусто — подпись «Команда FlyGuru».
  authorName: string;
  sourceName: string;
  sourceUrl: string;
  // Свой адрес поста — только если его правили руками. null — адрес
  // собирается из заголовка, как раньше. После первой публикации игнорируется.
  slug: string | null;
  // save — сохранить, не меняя статуса; publish — опубликовать (или вернуть
  // скрытый); hide — снять с публикации.
  intent: "save" | "publish" | "hide";
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function oneLine(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

// Автор и источник: необязательные, но если источник указан ссылкой — ссылка
// должна быть настоящей (https://…), иначе на сайте получилась бы битая.
function extraFields(input: SavePostInput):
  | { author_name: string | null; source_name: string | null; source_url: string | null }
  | { error: string } {
  const author = oneLine(input.authorName, 100);
  let sourceName = oneLine(input.sourceName, 200);
  const rawUrl = String(input.sourceUrl ?? "").trim();
  let sourceUrl: string | null = null;
  if (rawUrl) {
    const href = safeHref(rawUrl);
    if (!href || !/^https?:\/\//i.test(href)) {
      return { error: "Ссылка на источник должна начинаться с https://" };
    }
    sourceUrl = href;
    // Ссылку без названия подписываем доменом: «Источник: liftfoils.com».
    if (!sourceName) sourceName = new URL(href).hostname.replace(/^www\./, "");
  }
  return {
    author_name: author || null,
    source_name: sourceName || null,
    source_url: sourceUrl,
  };
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

async function slugTaken(admin: Admin, slug: string, ownId: string | null): Promise<boolean> {
  const { data, error } = await admin.from("journal_posts").select("id").eq("slug", slug);
  if (error) throw new Error(`[journal] не удалось проверить адрес: ${error.message}`);
  return (data ?? []).some((row) => row.id !== ownId);
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

  const extra = extraFields(input);
  if ("error" in extra) return { error: extra.error };

  // Свой адрес — проверяем формат сразу, занятость — ниже, когда знаем id.
  const wantedSlug = input.slug === null ? null : input.slug.trim();
  if (wantedSlug !== null && (!SLUG_RE.test(wantedSlug) || wantedSlug.length > SLUG_MAX)) {
    return {
      error: `Адрес: только латиница, цифры и дефисы между ними, до ${SLUG_MAX} символов.`,
    };
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const fields = {
    title,
    body,
    cover_path: coverPath(body),
    category_id: categoryId,
    ...extra,
    updated_by: user.id,
    updated_at: now,
  };

  // ── Новый пост ──
  if (!input.id) {
    if (input.intent === "hide") return { error: "Черновик и так не виден на сайте." };
    const status: JournalStatus = input.intent === "publish" ? "published" : "draft";
    if (wantedSlug && (await slugTaken(admin, wantedSlug, null))) {
      return { error: `Адрес «${wantedSlug}» уже занят другим постом.` };
    }
    const base = wantedSlug ?? slugify(title);
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
        if (status === "published") announce(slug);
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
  // Адрес следует за заголовком (или за ручной правкой), пока пост ни разу не
  // публиковался. После первой публикации он заморожен: ссылка уже могла уйти
  // в чаты и поисковик.
  let slug = post.slug;
  if (!everPublished && wantedSlug) {
    if (wantedSlug !== post.slug && (await slugTaken(admin, wantedSlug, post.id))) {
      return { error: `Адрес «${wantedSlug}» уже занят другим постом.` };
    }
    slug = wantedSlug;
  } else if (!everPublished && wantedSlug === null && title !== post.title) {
    slug = await freeSlug(admin, slugify(title), post.id);
  }
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
  // Черновик поисковику неинтересен; опубликованный, правленый или только что
  // скрытый (адрес теперь 404) — да.
  if (status === "published" || post.status === "published") announce(slug);
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

// ── Категория поста прямо из списка ──────────────────────────────────────────
// Смена категории — не правка текста: пометку «изменено» она не ставит.
export async function setJournalPostCategoryAction(
  postId: string,
  categoryId: string | null,
): Promise<{ error: string | null }> {
  const user = await requireOffice();
  if (!isUuid(postId)) return { error: "Пост не найден." };
  if (categoryId && !isUuid(categoryId)) return { error: "Категория не найдена." };

  const { error } = await createAdminClient()
    .from("journal_posts")
    .update({ category_id: categoryId || null, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", postId);
  if (error) return { error: `Не удалось сменить категорию: ${error.message}` };
  refreshJournal();
  return { error: null };
}

// ── Категории ────────────────────────────────────────────────────────────────
// Справочник правят сами админ и СММщик. Категорию с постами не удаляют, а
// убирают из списка выбора (hidden): посты не должны молча терять её. На сайте
// у уже привязанных постов название остаётся.

function categoryName(raw: string): string | { error: string } {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return { error: "Введите название категории." };
  if (name.length > 60) return { error: "Название длиннее 60 символов." };
  return name;
}

function categoryError(error: { code?: string; message: string }, name: string): string {
  return error.code === "23505"
    ? `Категория «${name}» уже есть.`
    : `Не удалось сохранить категорию: ${error.message}`;
}

export async function createJournalCategoryAction(raw: string): Promise<{ error: string | null }> {
  await requireOffice();
  const name = categoryName(raw);
  if (typeof name !== "string") return name;

  const admin = createAdminClient();
  // Новая — в конец списка.
  const { data: last, error: readError } = await admin
    .from("journal_categories")
    .select("sort")
    .order("sort", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) return { error: `Не удалось прочитать категории: ${readError.message}` };

  const { error } = await admin
    .from("journal_categories")
    .insert({ name, sort: ((last?.sort as number | undefined) ?? 0) + 10 });
  if (error) return { error: categoryError(error, name) };
  refreshJournal();
  return { error: null };
}

export async function renameJournalCategoryAction(
  id: string,
  raw: string,
): Promise<{ error: string | null }> {
  await requireOffice();
  if (!isUuid(id)) return { error: "Категория не найдена." };
  const name = categoryName(raw);
  if (typeof name !== "string") return name;

  const { error } = await createAdminClient()
    .from("journal_categories")
    .update({ name })
    .eq("id", id);
  if (error) return { error: categoryError(error, name) };
  refreshJournal();
  return { error: null };
}

export async function setJournalCategoryHiddenAction(
  id: string,
  hidden: boolean,
): Promise<{ error: string | null }> {
  await requireOffice();
  if (!isUuid(id)) return { error: "Категория не найдена." };
  const { error } = await createAdminClient()
    .from("journal_categories")
    .update({ hidden: hidden === true })
    .eq("id", id);
  if (error) return { error: `Не удалось сохранить категорию: ${error.message}` };
  refreshJournal();
  return { error: null };
}

export async function deleteJournalCategoryAction(id: string): Promise<{ error: string | null }> {
  await requireOffice();
  if (!isUuid(id)) return { error: "Категория не найдена." };

  const admin = createAdminClient();
  const { count, error: countError } = await admin
    .from("journal_posts")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  if (countError) return { error: `Не удалось проверить посты: ${countError.message}` };
  if ((count ?? 0) > 0) {
    return { error: "В категории есть посты — её можно только убрать из списка." };
  }

  const { error } = await admin.from("journal_categories").delete().eq("id", id);
  if (error) return { error: `Не удалось удалить категорию: ${error.message}` };
  refreshJournal();
  return { error: null };
}
