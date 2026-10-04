import { createPublicClient } from "@/lib/supabase/public";
import { parseBody, type JournalBlock } from "@/lib/journal";

// Чтение журнала для публичных страниц и sitemap.xml — только опубликованное
// (это держит RLS, см. lib/supabase/public.ts).
//
// Ошибка чтения — не «постов нет», а ошибка. На живом сайте Next в этом
// случае продолжает отдавать прежнюю, успешно собранную версию страницы, а
// пустой журнал, закэшированный на час из-за сбоя сети, выглядел бы так, будто
// все статьи удалили.
//
// Исключение одно — сборка без базы (CI собирает сайт без доступа к ней, как и
// список услуг в lib/services). Тогда журнал собирается пустым и
// пересобирается с настоящими постами при первой же ревалидации.
function failOrEmptyOnBuild<T>(error: { message: string }, what: string, empty: T): T {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    console.warn(`[journal] ${what} при сборке: ${error.message} — собираю пустым`);
    return empty;
  }
  throw new Error(`[journal] ${what}: ${error.message}`);
}

export interface JournalCard {
  slug: string;
  title: string;
  coverPath: string | null;
  category: string | null;
  publishedAt: string;
  excerptSource: JournalBlock[];
}

export interface JournalPost {
  slug: string;
  title: string;
  body: JournalBlock[];
  coverPath: string | null;
  category: string | null;
  authorName: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  publishedAt: string;
  editedAt: string | null;
}

interface PostRow {
  slug: string;
  title: string;
  body: unknown;
  cover_path: string | null;
  category: { name: string } | null;
  author_name: string | null;
  source_name: string | null;
  source_url: string | null;
  published_at: string;
  edited_at: string | null;
}

const POST_COLUMNS =
  "slug, title, body, cover_path, category:journal_categories(name), author_name, source_name, source_url, published_at, edited_at";

export async function getPublishedPosts(): Promise<JournalCard[]> {
  const { data, error } = await createPublicClient()
    .from("journal_posts")
    .select(POST_COLUMNS)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) return failOrEmptyOnBuild(error, "не удалось прочитать журнал", []);

  return ((data ?? []) as unknown as PostRow[]).map((row) => ({
    slug: row.slug,
    title: row.title,
    coverPath: row.cover_path,
    category: row.category?.name ?? null,
    publishedAt: row.published_at,
    // Описание карточки считается из текста: отдаём блоки, а не готовую
    // строку, чтобы длину выбирала сама вёрстка.
    excerptSource: parseBody(row.body),
  }));
}

export async function getPublishedPost(slug: string): Promise<JournalPost | null> {
  const { data, error } = await createPublicClient()
    .from("journal_posts")
    .select(POST_COLUMNS)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return failOrEmptyOnBuild(error, "не удалось прочитать пост", null);
  if (!data) return null;

  const row = data as unknown as PostRow;
  return {
    slug: row.slug,
    title: row.title,
    body: parseBody(row.body),
    coverPath: row.cover_path,
    category: row.category?.name ?? null,
    authorName: row.author_name,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    publishedAt: row.published_at,
    editedAt: row.edited_at,
  };
}

// Для sitemap.xml: адрес и честная дата последней правки.
export async function getSitemapPosts(): Promise<{ slug: string; lastModified: string }[]> {
  const { data, error } = await createPublicClient()
    .from("journal_posts")
    .select("slug, published_at, edited_at")
    .eq("status", "published");
  if (error) return failOrEmptyOnBuild(error, "не удалось прочитать журнал для sitemap", []);
  return (data ?? []).map((row) => ({
    slug: row.slug as string,
    lastModified: (row.edited_at ?? row.published_at) as string,
  }));
}
