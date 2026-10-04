// Журнал: общие правила поста — без базы и без React, чтобы их одинаково
// применяли редактор, server actions и публичные страницы (и чтобы их можно
// было проверить тестами).
//
// Пост — это заголовок и список блоков. Блоки, а не «HTML из редактора»:
// на телефоне так удобнее (абзац, «+ Фото», снова абзац), а на сайт попадает
// только то, что мы сами умеем нарисовать. Чужой HTML и скрипты в статью не
// пролезут, даже если кто-то отправит запрос мимо интерфейса.

export const JOURNAL_BUCKET = "journal";

// Подпись поста, если конкретного автора не указали (решение David 04.10.2026).
export const JOURNAL_SIGNATURE = "Команда FlyGuru";

export type JournalStatus = "draft" | "published" | "hidden";

export const JOURNAL_STATUS_LABEL: Record<JournalStatus, string> = {
  draft: "Черновик",
  published: "Опубликован",
  hidden: "Скрыт",
};

export type JournalTextBlock = { type: "text"; text: string };
export type JournalHeadingBlock = { type: "heading"; text: string };
export type JournalListBlock = { type: "list"; ordered: boolean; items: string[] };
// caption — подпись под фото; она же alt для поисковика и экранных читалок.
export type JournalPhotoBlock = {
  type: "photo";
  path: string;
  w: number;
  h: number;
  caption?: string;
};
// Видео — только YouTube и только по ссылке: файл ролика в наш бакет не
// грузим, это сотни мегабайт. vertical — Shorts, у них кадр 9:16.
export type JournalVideoBlock = {
  type: "video";
  provider: "youtube";
  id: string;
  vertical: boolean;
};
export type JournalBlock =
  | JournalTextBlock
  | JournalHeadingBlock
  | JournalListBlock
  | JournalPhotoBlock
  | JournalVideoBlock;

// Пределы с запасом под длинную статью. Нужны не для красоты, а чтобы одним
// запросом нельзя было положить в базу мегабайты мусора.
export const TITLE_MAX = 200;
export const TEXT_BLOCK_MAX = 20_000;
export const BLOCKS_MAX = 100;
export const HEADING_MAX = 200;
export const CAPTION_MAX = 300;
const LIST_ITEMS_MAX = 50;
const LIST_ITEM_MAX = 2_000;
const PHOTO_SIDE_MAX = 10_000;

// Свой путь в бакете: <год>/<uuid>.<ext>. Любой другой — чужой файл, и
// показывать его в посте нельзя (или он вовсе из другого бакета).
const PHOTO_PATH_RE =
  /^\d{4}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

export function isJournalPhotoPath(path: unknown): path is string {
  return typeof path === "string" && PHOTO_PATH_RE.test(path);
}

function photoSide(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= PHOTO_SIDE_MAX ? n : null;
}

// Одна строка: переносы и повторные пробелы схлопываются (заголовок, подпись,
// пункт списка не должны рваться на строки).
function oneLine(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

// Разбор тела поста из базы или из формы. Неизвестные блоки и мусорные поля
// отбрасываются молча: это не деньги, а вёрстка, и лучше показать пост без
// одного кривого блока, чем уронить страницу. Пустые абзацы выкидываются —
// на телефоне легко нажать «+ Текст» лишний раз.
//
// Порядок полей в собранных объектах постоянный: по JSON.stringify двух
// разборов сравнивается, менялся ли текст (contentChanged).
export function parseBody(raw: unknown): JournalBlock[] {
  if (!Array.isArray(raw)) return [];
  const blocks: JournalBlock[] = [];
  for (const item of raw) {
    if (blocks.length >= BLOCKS_MAX) break;
    if (!item || typeof item !== "object") continue;
    const block = item as Record<string, unknown>;
    if (block.type === "text" && typeof block.text === "string") {
      const text = normalizeText(block.text).slice(0, TEXT_BLOCK_MAX);
      if (text) blocks.push({ type: "text", text });
    } else if (block.type === "heading") {
      const text = oneLine(block.text, HEADING_MAX);
      if (text) blocks.push({ type: "heading", text });
    } else if (block.type === "list" && Array.isArray(block.items)) {
      const items = block.items
        .map((i) => oneLine(i, LIST_ITEM_MAX))
        .filter(Boolean)
        .slice(0, LIST_ITEMS_MAX);
      if (items.length) blocks.push({ type: "list", ordered: block.ordered === true, items });
    } else if (block.type === "photo" && isJournalPhotoPath(block.path)) {
      const w = photoSide(block.w);
      const h = photoSide(block.h);
      const caption = oneLine(block.caption, CAPTION_MAX);
      if (w && h) {
        blocks.push(
          caption
            ? { type: "photo", path: block.path, w, h, caption }
            : { type: "photo", path: block.path, w, h },
        );
      }
    } else if (
      block.type === "video" &&
      block.provider === "youtube" &&
      typeof block.id === "string" &&
      YOUTUBE_ID_RE.test(block.id)
    ) {
      blocks.push({ type: "video", provider: "youtube", id: block.id, vertical: block.vertical === true });
    }
  }
  return blocks;
}

// Переводы строк Windows → \n, хвостовые пробелы строк долой, больше одной
// пустой строки подряд не бывает. Сами абзацы сохраняются.
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Текстовый блок → абзацы. Пустая строка разделяет абзацы, одиночный перенос
// остаётся переносом внутри абзаца — так пишут и в Telegram.
export function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// ── Ссылки внутри текста ─────────────────────────────────────────────────────
// Пишутся как [текст](адрес) — кнопка «Ссылка» в редакторе вставляет их сама.
// Голый адрес https://… тоже становится ссылкой: с телефона ссылку чаще всего
// просто вставляют в текст.
//
// Адрес — только https?:// или свой путь вида /training. javascript:, data: и
// прочее молча превращаются в обычный текст: ссылка не должна уметь запустить
// скрипт у читателя.
export interface InlineSegment {
  text: string;
  href?: string;
}

export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(href)) return href;
  if (/^\/(?!\/)[^\s]*$/.test(href)) return href;
  return null;
}

const INLINE_RE =
  /\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?»"'])/g;

export function inlineSegments(text: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    if (m[1] !== undefined) {
      const href = safeHref(m[2]);
      out.push(href ? { text: m[1], href } : { text: m[1] });
    } else {
      out.push({ text: m[3], href: m[3] });
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

// Текст без разметки ссылок — для описания поста и подсчётов.
export function plainText(text: string): string {
  return inlineSegments(text)
    .map((s) => s.text)
    .join("");
}

// ── Видео ────────────────────────────────────────────────────────────────────
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// Ссылка, которую человек копирует из приложения YouTube, → id ролика.
// Понимает youtube.com/watch?v=…, youtu.be/…, /shorts/…, /embed/…, /live/…
export function parseYouTube(url: string): { id: string; vertical: boolean } | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^(?:www|m|music)\./, "");
  let id: string | null = null;
  let vertical = false;
  if (host === "youtu.be") {
    id = u.pathname.slice(1).split("/")[0] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") {
      id = u.searchParams.get("v");
    } else {
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/);
      if (m) {
        id = m[2];
        vertical = m[1] === "shorts";
      }
    }
  }
  return id && YOUTUBE_ID_RE.test(id) ? { id, vertical } : null;
}

export function coverPath(blocks: JournalBlock[]): string | null {
  const photo = blocks.find((b): b is JournalPhotoBlock => b.type === "photo");
  return photo?.path ?? null;
}

// Короткое описание поста: для карточки в журнале и для description страницы
// (то, что поисковик показывает под заголовком). Берём начало текста — абзацы
// и пункты списков, без подзаголовков — и режем по слову.
export function excerpt(blocks: JournalBlock[], max = 160): string {
  const text = blocks
    .flatMap((b) => (b.type === "text" ? [b.text] : b.type === "list" ? b.items : []))
    .map(plainText)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  // По слову — если пробел нашёлся не слишком близко к началу; одно гигантское
  // слово (ссылка) режем как есть.
  const head = lastSpace >= max * 0.5 ? cut.slice(0, lastSpace) : cut;
  return `${head.replace(/[\s.,;:!?—–-]+$/, "")}…`;
}

// ── Адрес поста ──────────────────────────────────────────────────────────────
// Из русского заголовка — латиницей: «Как починить крыло» → kak-pochinit-krylo.
// Латиница, а не кириллица в адресе: кириллическая ссылка в мессенджере
// превращается в простыню %D0%9A%D0%B0…, и её боятся открывать.
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export const SLUG_MAX = 80;

export function slugify(title: string): string {
  const latin = [...title.toLowerCase()]
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    // Вьетнамские и прочие диакритики: «đ» отдельно, остальное снимает NFKD.
    .replace(/đ/g, "d")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  const slug = latin
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  // Заголовок из одних эмодзи или иероглифов — адрес всё равно нужен.
  return slug || "post";
}

// Занятый адрес → тот же с номером: kak-pochinit-krylo-2, -3…
export function slugWithSuffix(base: string, n: number): string {
  if (n <= 1) return base;
  const suffix = `-${n}`;
  return `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, "")}${suffix}`;
}

// Изменился ли текст поста (заголовок или блоки). По нему ставится пометка
// «изменено» у опубликованного поста; смена одной категории — не правка
// текста, как и в Telegram пометку даёт только правка самого сообщения.
export function contentChanged(
  before: { title: string; body: unknown },
  after: { title: string; body: JournalBlock[] },
): boolean {
  return (
    before.title !== after.title ||
    JSON.stringify(parseBody(before.body)) !== JSON.stringify(after.body)
  );
}

// Публичная ссылка на фото в бакете. Собираем сами, без клиента Supabase:
// функция нужна и серверу, и браузеру, а адрес у публичного бакета постоянный.
export function journalPhotoUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${JOURNAL_BUCKET}/${path}`;
}
