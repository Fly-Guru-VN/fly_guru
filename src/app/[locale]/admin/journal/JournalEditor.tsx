"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "@/i18n/navigation";
import { compressImage } from "@/lib/imageCompress";
import {
  CAPTION_MAX,
  HEADING_MAX,
  JOURNAL_STATUS_LABEL,
  SLUG_MAX,
  TITLE_MAX,
  journalPhotoUrl,
  parseBody,
  parseYouTube,
  safeHref,
  type JournalBlock,
  type JournalStatus,
} from "@/lib/journal";
import { Spinner } from "@/components/Spinner";
import { JournalArticle } from "@/components/journal/JournalArticle";
import { JournalVideo } from "@/components/journal/JournalVideo";
import { showToast } from "@/components/cabinet/Toast";
import {
  deleteJournalDraftAction,
  saveJournalPostAction,
  uploadJournalPhotoAction,
  type SavePostInput,
} from "./actions";

// Редактор поста журнала. Главный сценарий — телефон: заголовок, «+ Фото»,
// пара абзацев, «Опубликовать». Длинная статья — то же самое, только блоков
// больше: подзаголовки, списки, фото с подписями, видео, ссылки в тексте.
//
// Пост — список блоков, см. lib/journal. Фото загружается сразу после выбора,
// отдельным запросом: пока пишешь следующий абзац, оно уже на сервере, а
// «Сохранить» отправляет только текст и пути к фото.

export interface EditorCategory {
  id: string;
  name: string;
  hidden: boolean;
}

export interface EditorPost {
  id: string;
  slug: string;
  title: string;
  body: JournalBlock[];
  categoryId: string | null;
  authorName: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  status: JournalStatus;
  publishedAt: string | null;
  editedAt: string | null;
  updatedAt: string;
}

// Блок в редакторе: у каждого свой ключ (React должен различать два одинаковых
// абзаца). Список правится одним полем — пункт на строку, — так на телефоне
// проще, чем отдельное поле на каждый пункт.
type EditorBlock =
  | { key: number; type: "text"; text: string }
  | { key: number; type: "heading"; text: string }
  | { key: number; type: "list"; ordered: boolean; text: string }
  | { key: number; type: "photo"; path: string; w: number; h: number; caption: string }
  | { key: number; type: "video"; id: string; vertical: boolean }
  | { key: number; type: "uploading"; preview: string };

type BlockType = EditorBlock["type"];

const BLOCK_LABEL: Record<BlockType, string> = {
  text: "Текст",
  heading: "Подзаголовок",
  list: "Список",
  photo: "Фото",
  video: "Видео",
  uploading: "Фото",
};

let nextKey = 1;

function fromBody(body: JournalBlock[]): EditorBlock[] {
  return body.map((b): EditorBlock => {
    const key = nextKey++;
    switch (b.type) {
      case "text":
      case "heading":
        return { key, type: b.type, text: b.text };
      case "list":
        return { key, type: "list", ordered: b.ordered, text: b.items.join("\n") };
      case "photo":
        return { key, type: "photo", path: b.path, w: b.w, h: b.h, caption: b.caption ?? "" };
      case "video":
        return { key, type: "video", id: b.id, vertical: b.vertical };
    }
  });
}

// То, что уходит на сервер и с чем сравнивается «сохранено ли». Загружаемые
// фото сюда не попадают: пути у них ещё нет. Пустые блоки тоже — сервер их всё
// равно выбросит, а пустое поле для набора не должно считаться правкой.
function toBody(blocks: EditorBlock[]): JournalBlock[] {
  return blocks.flatMap((b): JournalBlock[] => {
    switch (b.type) {
      case "text":
        return b.text.trim() ? [{ type: "text", text: b.text }] : [];
      case "heading":
        return b.text.trim() ? [{ type: "heading", text: b.text.trim() }] : [];
      case "list": {
        const items = b.text
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        return items.length ? [{ type: "list", ordered: b.ordered, items }] : [];
      }
      case "photo": {
        const caption = b.caption.trim();
        return [
          caption
            ? { type: "photo", path: b.path, w: b.w, h: b.h, caption }
            : { type: "photo", path: b.path, w: b.w, h: b.h },
        ];
      }
      case "video":
        return [{ type: "video", provider: "youtube", id: b.id, vertical: b.vertical }];
      case "uploading":
        return [];
    }
  });
}

interface Fields {
  title: string;
  blocks: EditorBlock[];
  categoryId: string | null;
  authorName: string;
  sourceName: string;
  sourceUrl: string;
  slug: string;
}

function snapshot(f: Fields): string {
  return JSON.stringify({
    title: f.title.trim(),
    body: toBody(f.blocks),
    categoryId: f.categoryId,
    authorName: f.authorName.trim(),
    sourceName: f.sourceName.trim(),
    sourceUrl: f.sourceUrl.trim(),
    slug: f.slug.trim(),
  });
}

// ── Копия набранного в памяти телефона ───────────────────────────────────────
// Пропала связь на пляже, телефон выгрузил вкладку, случайно закрыли браузер —
// текст не должен пропасть. Пока есть несохранённые правки, их копия лежит в
// localStorage этого устройства; после сохранения копия стирается. Память
// браузера может быть недоступна (приватный режим) — тогда просто без копии.
interface Backup {
  at: string;
  title: string;
  body: JournalBlock[];
  categoryId: string | null;
  authorName: string;
  sourceName: string;
  sourceUrl: string;
  slug: string;
}

const backupKey = (id: string | null) => `flyguru:journal-backup:${id ?? "new"}`;

function readBackup(id: string | null): Backup | null {
  try {
    const raw = window.localStorage.getItem(backupKey(id));
    if (!raw) return null;
    const b = JSON.parse(raw) as Backup;
    return typeof b.at === "string" && typeof b.title === "string" ? b : null;
  } catch {
    return null;
  }
}

function writeBackup(id: string | null, backup: Backup) {
  try {
    window.localStorage.setItem(backupKey(id), JSON.stringify(backup));
  } catch {
    /* память браузера недоступна — работаем без копии */
  }
}

function dropBackup(id: string | null) {
  try {
    window.localStorage.removeItem(backupKey(id));
  } catch {
    /* см. выше */
  }
}

// Размер кадра меряет браузер: сервер его не декодирует, а странице поста он
// нужен, чтобы заранее оставить место под фото.
async function measure(file: File): Promise<{ w: number; h: number } | null> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const size = { w: bitmap.width, h: bitmap.height };
      bitmap.close();
      return size;
    }
  } catch {
    /* ниже — запасной путь через <img> */
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new window.Image();
    img.src = url;
    await img.decode();
    return { w: img.naturalWidth, h: img.naturalHeight };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Источник без названия сервер подписывает доменом ссылки — предпросмотр так же.
function sourceHost(url: string): string | null {
  try {
    return url.trim() ? new URL(url.trim()).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

// Поле текста растёт вместе с текстом: прокрутка внутри маленького окошка на
// телефоне — худшее, что можно сделать с длинным абзацем.
function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
}

const STATUS_CHIP: Record<JournalStatus, string> = {
  draft: "bg-line/60 text-ink",
  published: "bg-emerald-100 text-emerald-800",
  hidden: "bg-amber-100 text-amber-800",
};

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2.5 outline-none focus:border-primary";
const smallButton =
  "rounded-full border border-line px-3.5 py-2 text-sm font-semibold hover:border-primary hover:text-primary";
const iconButton =
  "flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-line/50 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";

export function JournalEditor({
  base,
  categories,
  post,
}: {
  base: string;
  categories: EditorCategory[];
  post: EditorPost | null;
}) {
  const router = useRouter();
  const [id, setId] = useState(post?.id ?? null);
  const [status, setStatus] = useState<JournalStatus>(post?.status ?? "draft");
  const [publishedAt, setPublishedAt] = useState(post?.publishedAt ?? null);
  const [title, setTitle] = useState(post?.title ?? "");
  const [categoryId, setCategoryId] = useState(post?.categoryId ?? null);
  const [authorName, setAuthorName] = useState(post?.authorName ?? "");
  const [sourceName, setSourceName] = useState(post?.sourceName ?? "");
  const [sourceUrl, setSourceUrl] = useState(post?.sourceUrl ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  // Адрес правили руками — тогда он больше не следует за заголовком.
  const [slugTouched, setSlugTouched] = useState(false);
  // Новый пост сразу с пустым абзацем: открыл — и пишешь.
  const [blocks, setBlocks] = useState<EditorBlock[]>(() =>
    post && post.body.length > 0 ? fromBody(post.body) : fromBody([{ type: "text", text: "" }]),
  );
  const [saved, setSaved] = useState(() =>
    post
      ? snapshot({
          title: post.title,
          blocks: fromBody(post.body),
          categoryId: post.categoryId,
          authorName: post.authorName ?? "",
          sourceName: post.sourceName ?? "",
          sourceUrl: post.sourceUrl ?? "",
          slug: post.slug,
        })
      : null,
  );
  const [savedAt, setSavedAt] = useState(post?.updatedAt ?? null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const textareas = useRef(new Map<number, HTMLTextAreaElement>());
  // После какого блока вставлять новый: последний, в котором был курсор.
  const anchor = useRef<number | null>(null);

  const fields: Fields = { title, blocks, categoryId, authorName, sourceName, sourceUrl, slug };
  const current = snapshot(fields);
  const body = toBody(blocks);
  const dirty =
    saved === null ? title.trim() !== "" || body.length > 0 : current !== saved;
  const uploading = blocks.some((b) => b.type === "uploading");
  const everPublished = publishedAt !== null;

  // Уйти со страницы с несохранённым текстом — браузер переспросит.
  useEffect(() => {
    if (!dirty && !uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, uploading]);

  // При открытии: нет ли в памяти телефона копии новее того, что на сервере.
  useEffect(() => {
    const found = readBackup(post?.id ?? null);
    if (!found) return;
    const newer = !post || found.at > post.updatedAt;
    const differs =
      snapshot({ ...found, blocks: fromBody(found.body) }) !==
      (post
        ? snapshot({
            title: post.title,
            blocks: fromBody(post.body),
            categoryId: post.categoryId,
            authorName: post.authorName ?? "",
            sourceName: post.sourceName ?? "",
            sourceUrl: post.sourceUrl ?? "",
            slug: post.slug,
          })
        : "");
    // Копия из localStorage существует только в браузере — показать её можно
    // лишь после первой отрисовки, иначе разметка сервера и браузера разойдётся.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (newer && differs) setBackup(found);
    else dropBackup(post?.id ?? null);
  }, [post]);

  // Пока есть несохранённое — держим копию (раз в секунду, а не на каждую букву).
  useEffect(() => {
    if (!dirty || backup) return;
    const timer = window.setTimeout(() => {
      writeBackup(id, {
        at: new Date().toISOString(),
        title,
        body,
        categoryId,
        authorName,
        sourceName,
        sourceUrl,
        slug,
      });
    }, 1000);
    return () => window.clearTimeout(timer);
    // body пересобирается на каждый рендер — следим за его содержимым.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, dirty, backup, id]);

  function restoreBackup() {
    if (!backup) return;
    setTitle(backup.title);
    setBlocks(backup.body.length ? fromBody(backup.body) : fromBody([{ type: "text", text: "" }]));
    setCategoryId(backup.categoryId);
    setAuthorName(backup.authorName);
    setSourceName(backup.sourceName);
    setSourceUrl(backup.sourceUrl);
    if (!everPublished && backup.slug !== slug) {
      setSlug(backup.slug);
      setSlugTouched(true);
    }
    setBackup(null);
    showToast("Текст восстановлен — не забудьте сохранить");
  }

  function discardBackup() {
    dropBackup(id);
    setBackup(null);
  }

  // Скрытую категорию показываем, только если она уже стоит у поста.
  const categoryOptions = useMemo(
    () => categories.filter((c) => !c.hidden || c.id === categoryId),
    [categories, categoryId],
  );

  // ── Блоки ──
  function patchBlock(key: number, patch: Partial<EditorBlock>) {
    setBlocks((prev) =>
      prev.map((b) => (b.key === key ? ({ ...b, ...patch } as EditorBlock) : b)),
    );
  }

  function removeBlock(key: number) {
    setBlocks((prev) => prev.filter((b) => b.key !== key));
  }

  function moveBlock(key: number, delta: -1 | 1) {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  // Новый блок — после того, где стоял курсор, а не всегда в конец: в длинной
  // статье иначе пришлось бы гнать каждый новый блок стрелками наверх.
  function insertBlock(block: EditorBlock) {
    // Якорь читаем сейчас, а не внутри setBlocks: функция-обновитель
    // выполнится позже, когда anchor уже будет указывать на новый блок.
    const after = anchor.current;
    setBlocks((prev) => {
      const at = prev.findIndex((b) => b.key === after);
      const next = [...prev];
      next.splice(at < 0 ? prev.length : at + 1, 0, block);
      return next;
    });
    anchor.current = block.key;
  }

  function addSimple(type: "text" | "heading" | "list") {
    const key = nextKey++;
    insertBlock(
      type === "list"
        ? { key, type: "list", ordered: false, text: "" }
        : { key, type, text: "" },
    );
  }

  function addVideo() {
    const url = window.prompt("Ссылка на видео YouTube (из кнопки «Поделиться»)");
    if (!url) return;
    const video = parseYouTube(url);
    if (!video) {
      setError("Это не ссылка на видео YouTube. Скопируйте её кнопкой «Поделиться» в YouTube.");
      return;
    }
    setError(null);
    insertBlock({ key: nextKey++, type: "video", ...video });
  }

  // Ссылка на выделенный кусок текста: [слово](адрес). Без выделения —
  // вставляется заготовка, где «текст ссылки» сразу выделен для замены.
  function addLink(key: number) {
    const el = textareas.current.get(key);
    const block = blocks.find((b) => b.key === key);
    if (!el || !block || (block.type !== "text" && block.type !== "list")) return;
    const { selectionStart: from, selectionEnd: to } = el;
    const raw = window.prompt("Адрес ссылки: https://… или раздел сайта, например /training");
    if (!raw) return;
    const href = safeHref(raw.trim());
    if (!href) {
      setError("Ссылка должна начинаться с https:// или с / (раздел нашего сайта).");
      return;
    }
    setError(null);
    const selected = block.text.slice(from, to).trim() || "текст ссылки";
    const text = `${block.text.slice(0, from)}[${selected}](${href})${block.text.slice(to)}`;
    patchBlock(key, { text });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(from + 1, from + 1 + selected.length);
      autoGrow(el);
    });
  }

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    // По очереди: на мобильном интернете пять параллельных загрузок мешают
    // друг другу, а порядок фото в посте должен совпасть с порядком выбора.
    for (const original of Array.from(files)) {
      const key = nextKey++;
      const previewUrl = URL.createObjectURL(original);
      insertBlock({ key, type: "uploading", preview: previewUrl });
      try {
        const file = await compressImage(original);
        const size = await measure(file);
        if (!size) throw new Error("Не удалось прочитать фото. Попробуйте другой снимок.");
        const form = new FormData();
        form.set("photo", file);
        form.set("w", String(size.w));
        form.set("h", String(size.h));
        const result = await uploadJournalPhotoAction(form);
        if (result.error !== undefined) throw new Error(result.error);
        setBlocks((prev) =>
          prev.map((b) =>
            b.key === key
              ? { key, type: "photo", path: result.path, w: result.w, h: result.h, caption: "" }
              : b,
          ),
        );
      } catch (e) {
        setBlocks((prev) => prev.filter((b) => b.key !== key));
        setError(e instanceof Error ? e.message : "Не удалось загрузить фото.");
      } finally {
        URL.revokeObjectURL(previewUrl);
      }
    }
  }

  // ── Сохранение ──
  function save(intent: SavePostInput["intent"]) {
    if (
      intent === "hide" &&
      !window.confirm(
        "Скрыть пост? Он пропадёт с сайта, но останется здесь — его можно будет опубликовать снова.",
      )
    ) {
      return;
    }
    setError(null);
    // Что именно ушло на сервер: пока ждём ответа, человек может печатать
    // дальше, и эти правки останутся «несохранёнными» — так и должно быть.
    const sent = fields;
    startTransition(async () => {
      const result = await saveJournalPostAction({
        id,
        title,
        body,
        categoryId,
        authorName,
        sourceName,
        sourceUrl,
        slug: slugTouched ? slug : null,
        intent,
      });
      if (result.error !== undefined) {
        setError(result.error);
        return;
      }
      dropBackup(id);
      // Адрес мог собраться заново из заголовка — сравниваем уже с ним.
      setSaved(snapshot({ ...sent, slug: result.slug }));
      setSlug(result.slug);
      setSlugTouched(false);
      setSavedAt(result.savedAt);
      setStatus(result.status);
      if (result.status === "published" && !publishedAt) setPublishedAt(result.savedAt);
      showToast(
        intent === "publish"
          ? "Опубликовано"
          : intent === "hide"
            ? "Пост скрыт с сайта"
            : "Сохранено",
      );
      // Новый пост получил id — переезжаем на его адрес, чтобы обновление
      // страницы не открыло пустой редактор.
      if (!id) {
        setId(result.id);
        router.replace(`${base}/journal/${result.id}`);
      }
    });
  }

  function removeDraft() {
    if (!id || !window.confirm("Удалить черновик вместе с фото? Это нельзя отменить.")) return;
    startTransition(async () => {
      const result = await deleteJournalDraftAction(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      dropBackup(id);
      setSaved(current); // чтобы уход со страницы не переспрашивал
      showToast("Черновик удалён");
      router.push(`${base}/journal`);
    });
  }

  const busy = pending || uploading;
  const saveState = uploading
    ? "Загружаем фото…"
    : dirty
      ? "Есть несохранённые изменения"
      : savedAt
        ? `Сохранено в ${timeLabel(savedAt)}`
        : "";
  const categoryName = categories.find((c) => c.id === categoryId)?.name ?? null;

  return (
    <div className="mx-auto max-w-2xl">
      {/* ── Статус: что с постом и сохранено ли ── */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_CHIP[status]}`}>
          {JOURNAL_STATUS_LABEL[status]}
        </span>
        {saveState && (
          <span className={dirty ? "font-semibold text-amber-700" : "text-muted"}>{saveState}</span>
        )}
        <span className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className="font-semibold text-primary hover:underline"
          >
            {preview ? "← К редактированию" : "Предпросмотр"}
          </button>
          {status === "published" && (
            <a
              href={`/journal/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              На сайте ↗
            </a>
          )}
        </span>
      </div>

      {backup && (
        <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-900">
            На этом устройстве есть несохранённый текст от {timeLabel(backup.at)}.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={restoreBackup} className={smallButton}>
              Восстановить
            </button>
            <button type="button" onClick={discardBackup} className={smallButton}>
              Отбросить
            </button>
          </div>
        </div>
      )}

      {preview ? (
        // ── Предпросмотр: та же вёрстка, что на сайте ──
        <div className="mt-4 rounded-3xl border border-line bg-surface-2/40 px-4 pb-8 sm:px-6">
          {title.trim() || body.length > 0 ? (
            <JournalArticle
              title={title.trim() || "Без заголовка"}
              category={categoryName}
              publishedAt={publishedAt ?? new Date().toISOString()}
              body={parseBody(body)}
              authorName={authorName.trim() || null}
              sourceName={sourceName.trim() || sourceHost(sourceUrl)}
              sourceUrl={safeHref(sourceUrl.trim())}
              sourceLabel="Источник"
              editedText={null}
              editedAt={null}
            />
          ) : (
            <p className="pt-8 text-center text-muted">Пока нечего показать — напишите что-нибудь.</p>
          )}
          {uploading && (
            <p className="mt-4 text-sm text-muted">Фото, которые ещё загружаются, появятся после загрузки.</p>
          )}
        </div>
      ) : (
        <>
          {/* ── Заголовок ── */}
          <label className="mt-4 block text-xs font-semibold text-muted">
            Заголовок
            <input
              type="text"
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Как мы чинили крыло после шторма"
              className={`mt-1 text-lg font-bold ${inputClass}`}
            />
          </label>

          {/* ── Блоки ── */}
          <div className="mt-4 space-y-3">
            {blocks.map((block, index) => (
              <section
                key={block.key}
                onFocusCapture={() => {
                  anchor.current = block.key;
                }}
                className="rounded-2xl border border-line bg-surface p-2"
              >
                {/* Шапка блока: что это и как его двигать */}
                <div className="flex items-center gap-1 px-1 pb-1">
                  <span className="text-xs font-semibold text-muted">{BLOCK_LABEL[block.type]}</span>
                  {block.type === "list" && (
                    <button
                      type="button"
                      onClick={() => patchBlock(block.key, { ordered: !block.ordered })}
                      className="ml-2 rounded-full bg-line/50 px-2 py-0.5 text-xs font-semibold hover:bg-line"
                    >
                      {block.ordered ? "1. 2. 3." : "• • •"}
                    </button>
                  )}
                  {(block.type === "text" || block.type === "list") && (
                    <button
                      type="button"
                      // mousedown, а не click: иначе на ПК поле теряет
                      // выделение раньше, чем мы его прочитаем.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addLink(block.key)}
                      className="ml-2 rounded-full bg-line/50 px-2 py-0.5 text-xs font-semibold hover:bg-line"
                    >
                      🔗 Ссылка
                    </button>
                  )}
                  <span className="ml-auto flex items-center">
                    <button
                      type="button"
                      onClick={() => moveBlock(block.key, -1)}
                      disabled={index === 0}
                      aria-label="Выше"
                      className={iconButton}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBlock(block.key, 1)}
                      disabled={index === blocks.length - 1}
                      aria-label="Ниже"
                      className={iconButton}
                    >
                      ↓
                    </button>
                    {block.type !== "uploading" && (
                      <button
                        type="button"
                        onClick={() => removeBlock(block.key)}
                        aria-label="Убрать блок"
                        className={`${iconButton} hover:text-red-600`}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </div>

                {(block.type === "text" || block.type === "list") && (
                  <textarea
                    value={block.text}
                    ref={(el) => {
                      if (el) {
                        textareas.current.set(block.key, el);
                        autoGrow(el);
                      } else {
                        textareas.current.delete(block.key);
                      }
                    }}
                    rows={block.type === "list" ? 3 : 4}
                    onChange={(e) => {
                      patchBlock(block.key, { text: e.target.value });
                      autoGrow(e.target);
                    }}
                    placeholder={
                      block.type === "list"
                        ? "Каждый пункт — с новой строки"
                        : "Текст. Пустая строка — новый абзац."
                    }
                    className={`resize-none leading-relaxed ${inputClass}`}
                  />
                )}
                {block.type === "heading" && (
                  <input
                    type="text"
                    value={block.text}
                    maxLength={HEADING_MAX}
                    onChange={(e) => patchBlock(block.key, { text: e.target.value })}
                    placeholder="Подзаголовок раздела статьи"
                    className={`text-lg font-bold ${inputClass}`}
                  />
                )}
                {block.type === "photo" && (
                  <>
                    <Image
                      src={journalPhotoUrl(block.path)}
                      alt=""
                      width={block.w}
                      height={block.h}
                      sizes="(max-width: 768px) 100vw, 672px"
                      className="mx-auto h-auto max-h-[60vh] w-auto max-w-full rounded-xl bg-surface-2"
                    />
                    <input
                      type="text"
                      value={block.caption}
                      maxLength={CAPTION_MAX}
                      onChange={(e) => patchBlock(block.key, { caption: e.target.value })}
                      placeholder="Подпись к фото (необязательно)"
                      className={`mt-2 text-sm ${inputClass}`}
                    />
                  </>
                )}
                {block.type === "video" && <JournalVideo id={block.id} vertical={block.vertical} />}
                {block.type === "uploading" && (
                  <div className="relative overflow-hidden rounded-xl bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- превью из памяти телефона (blob:), next/image его не обрабатывает */}
                    <img src={block.preview} alt="" className="mx-auto max-h-[60vh] opacity-50" />
                    <span className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-semibold text-primary">
                      <Spinner className="h-4 w-4" />
                      Загружаем…
                    </span>
                  </div>
                )}
              </section>
            ))}
          </div>

          {/* ── Добавить блок ── */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => addSimple("text")} className={smallButton}>
              + Текст
            </button>
            <button type="button" onClick={() => fileInput.current?.click()} className={smallButton}>
              + Фото
            </button>
            <button type="button" onClick={() => addSimple("heading")} className={smallButton}>
              + Подзаголовок
            </button>
            <button type="button" onClick={() => addSimple("list")} className={smallButton}>
              + Список
            </button>
            <button type="button" onClick={addVideo} className={smallButton}>
              + Видео
            </button>
            {/* Без capture: телефон сам предложит и камеру, и галерею. */}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.target.value = ""; // иначе тот же файл второй раз не выберется
              }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            Новый блок встаёт после того, в котором вы сейчас. Порядок меняется стрелками ↑ ↓.
          </p>

          {/* ── Категория ── */}
          <label className="mt-6 block text-xs font-semibold text-muted">
            Категория
            <select
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value || null)}
              className={`mt-1 ${inputClass}`}
            >
              <option value="">Без категории</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {/* ── Дополнительно: всё необязательное ── */}
          <details className="mt-4 rounded-2xl border border-line bg-surface p-3">
            <summary className="cursor-pointer text-sm font-semibold">Дополнительно</summary>
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-semibold text-muted">
                Автор
                <input
                  type="text"
                  value={authorName}
                  maxLength={100}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Команда FlyGuru"
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="block text-xs font-semibold text-muted">
                Источник — если брали информацию откуда-то
                <input
                  type="text"
                  value={sourceName}
                  maxLength={200}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="Например: Lift Foils"
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="block text-xs font-semibold text-muted">
                Ссылка на источник
                <input
                  type="url"
                  inputMode="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://…"
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="block text-xs font-semibold text-muted">
                Адрес поста
                {everPublished ? (
                  <p className="mt-1 break-all text-sm font-normal text-ink">
                    www.flyguru.pro/journal/{slug}
                    <span className="block text-xs text-muted">
                      После публикации адрес не меняется: ссылка уже могла уйти в чаты и Google.
                    </span>
                  </p>
                ) : (
                  <>
                    <input
                      type="text"
                      value={slug}
                      maxLength={SLUG_MAX}
                      onChange={(e) => {
                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                        setSlugTouched(true);
                      }}
                      placeholder="соберётся из заголовка"
                      className={`mt-1 font-mono text-sm ${inputClass}`}
                    />
                    <span className="mt-1 block font-normal">
                      Латиница, цифры и дефисы. Пусто — соберётся из заголовка при сохранении.
                    </span>
                  </>
                )}
              </label>
            </div>
          </details>
        </>
      )}

      {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}

      {/* ── Действия: набор зависит от статуса ── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {status === "draft" && (
          <>
            <ActionButton onClick={() => save("publish")} disabled={busy} primary pending={pending}>
              Опубликовать
            </ActionButton>
            <ActionButton onClick={() => save("save")} disabled={busy || !dirty}>
              Сохранить черновик
            </ActionButton>
          </>
        )}
        {status === "published" && (
          <>
            <ActionButton onClick={() => save("save")} disabled={busy || !dirty} primary pending={pending}>
              Сохранить изменения
            </ActionButton>
            <ActionButton onClick={() => save("hide")} disabled={busy}>
              Скрыть с сайта
            </ActionButton>
          </>
        )}
        {status === "hidden" && (
          <>
            <ActionButton onClick={() => save("publish")} disabled={busy} primary pending={pending}>
              Опубликовать снова
            </ActionButton>
            <ActionButton onClick={() => save("save")} disabled={busy || !dirty}>
              Сохранить
            </ActionButton>
          </>
        )}
        {status === "draft" && id && (
          <button
            type="button"
            onClick={removeDraft}
            disabled={busy}
            className="ml-auto text-sm font-semibold text-red-600 hover:underline disabled:opacity-50"
          >
            Удалить черновик
          </button>
        )}
      </div>
      {status === "published" && (
        <p className="mt-3 text-xs text-muted">
          Правка появится на сайте через несколько секунд после сохранения, а внизу поста —
          пометка «изменено».
        </p>
      )}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  primary = false,
  pending = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
        primary
          ? "bg-accent text-white hover:bg-accent-strong"
          : "border border-line hover:border-primary hover:text-primary"
      }`}
    >
      {primary && pending && <Spinner />}
      {children}
    </button>
  );
}
