"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "@/i18n/navigation";
import { compressImage } from "@/lib/imageCompress";
import {
  JOURNAL_STATUS_LABEL,
  TITLE_MAX,
  journalPhotoUrl,
  type JournalBlock,
  type JournalStatus,
} from "@/lib/journal";
import { Spinner } from "@/components/Spinner";
import { showToast } from "@/components/cabinet/Toast";
import {
  deleteJournalDraftAction,
  saveJournalPostAction,
  uploadJournalPhotoAction,
  type SavePostInput,
} from "./actions";

// Редактор поста журнала. Главный сценарий — телефон: заголовок, «+ Фото»,
// пара абзацев, «Опубликовать». Длинная статья — то же самое, только блоков
// больше (заголовки, списки и ссылки — этап 2).
//
// Пост — список блоков (текст / фото), см. lib/journal. Фото загружается сразу
// после выбора, отдельным запросом: пока пишешь следующий абзац, оно уже на
// сервере, а «Сохранить» отправляет только текст и пути к фото.

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
  status: JournalStatus;
  updatedAt: string;
}

// Блок в редакторе: у каждого свой ключ (React должен различать два одинаковых
// абзаца), у загружаемого фото — превью из памяти телефона.
type EditorBlock =
  | { key: number; type: "text"; text: string }
  | { key: number; type: "photo"; path: string; w: number; h: number }
  | { key: number; type: "uploading"; preview: string };

let nextKey = 1;
const withKey = (block: JournalBlock): EditorBlock => ({ ...block, key: nextKey++ });

// То, что уходит на сервер и с чем сравнивается «сохранено ли». Загружаемые
// фото сюда не попадают: пути у них ещё нет. Пустые абзацы тоже — сервер их
// всё равно выбросит, а пустое поле для набора не должно считаться правкой.
function toBody(blocks: EditorBlock[]): JournalBlock[] {
  return blocks.flatMap((b): JournalBlock[] => {
    if (b.type === "text") return b.text.trim() ? [{ type: "text", text: b.text }] : [];
    if (b.type === "photo") return [{ type: "photo", path: b.path, w: b.w, h: b.h }];
    return [];
  });
}

function snapshot(title: string, blocks: EditorBlock[], categoryId: string | null) {
  return JSON.stringify({ title: title.trim(), body: toBody(blocks), categoryId });
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
  const [slug, setSlug] = useState(post?.slug ?? null);
  const [status, setStatus] = useState<JournalStatus>(post?.status ?? "draft");
  const [title, setTitle] = useState(post?.title ?? "");
  const [categoryId, setCategoryId] = useState(post?.categoryId ?? null);
  // Новый пост сразу с пустым абзацем: открыл — и пишешь.
  const [blocks, setBlocks] = useState<EditorBlock[]>(() =>
    post && post.body.length > 0 ? post.body.map(withKey) : [withKey({ type: "text", text: "" })],
  );
  const [saved, setSaved] = useState(() =>
    post ? snapshot(post.title, post.body.map(withKey), post.categoryId) : null,
  );
  const [savedAt, setSavedAt] = useState(post?.updatedAt ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const current = snapshot(title, blocks, categoryId);
  const dirty = saved === null ? title.trim() !== "" || toBody(blocks).length > 0 : current !== saved;
  const uploading = blocks.some((b) => b.type === "uploading");

  // Уйти со страницы с несохранённым текстом — браузер переспросит.
  useEffect(() => {
    if (!dirty && !uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, uploading]);

  // Скрытую категорию показываем, только если она уже стоит у поста.
  const categoryOptions = useMemo(
    () => categories.filter((c) => !c.hidden || c.id === categoryId),
    [categories, categoryId],
  );

  function updateBlock(key: number, text: string) {
    setBlocks((prev) => prev.map((b) => (b.key === key && b.type === "text" ? { ...b, text } : b)));
  }

  function removeBlock(key: number) {
    setBlocks((prev) => prev.filter((b) => b.key !== key));
  }

  function addText() {
    setBlocks((prev) => [...prev, withKey({ type: "text", text: "" })]);
  }

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    // По очереди: на мобильном интернете пять параллельных загрузок мешают
    // друг другу, а порядок фото в посте должен совпасть с порядком выбора.
    for (const original of Array.from(files)) {
      const key = nextKey++;
      const preview = URL.createObjectURL(original);
      setBlocks((prev) => [...prev, { key, type: "uploading", preview }]);
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
            b.key === key ? { key, type: "photo", path: result.path, w: result.w, h: result.h } : b,
          ),
        );
      } catch (e) {
        setBlocks((prev) => prev.filter((b) => b.key !== key));
        setError(e instanceof Error ? e.message : "Не удалось загрузить фото.");
      } finally {
        URL.revokeObjectURL(preview);
      }
    }
  }

  function save(intent: SavePostInput["intent"]) {
    if (intent === "hide" && !window.confirm("Скрыть пост? Он пропадёт с сайта, но останется здесь — его можно будет опубликовать снова.")) {
      return;
    }
    setError(null);
    const sentSnapshot = current;
    startTransition(async () => {
      const result = await saveJournalPostAction({
        id,
        title,
        body: toBody(blocks),
        categoryId,
        intent,
      });
      if (result.error !== undefined) {
        setError(result.error);
        return;
      }
      setSaved(sentSnapshot);
      setSavedAt(result.savedAt);
      setStatus(result.status);
      setSlug(result.slug);
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
        {status === "published" && slug && (
          <a
            href={`/journal/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto font-semibold text-primary hover:underline"
          >
            Открыть на сайте ↗
          </a>
        )}
      </div>

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
        {blocks.map((block) => (
          <div key={block.key} className="relative">
            {block.type === "text" && (
              <textarea
                value={block.text}
                ref={autoGrow}
                rows={3}
                onChange={(e) => {
                  updateBlock(block.key, e.target.value);
                  autoGrow(e.target);
                }}
                placeholder="Текст. Пустая строка — новый абзац."
                className={`resize-none pr-10 leading-relaxed ${inputClass}`}
              />
            )}
            {block.type === "photo" && (
              <Image
                src={journalPhotoUrl(block.path)}
                alt=""
                width={block.w}
                height={block.h}
                sizes="(max-width: 768px) 100vw, 672px"
                className="h-auto w-full rounded-xl bg-surface-2"
              />
            )}
            {block.type === "uploading" && (
              <div className="relative overflow-hidden rounded-xl bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- превью из памяти телефона (blob:), next/image его не обрабатывает */}
                <img src={block.preview} alt="" className="h-auto w-full opacity-50" />
                <span className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-semibold text-primary">
                  <Spinner className="h-4 w-4" />
                  Загружаем…
                </span>
              </div>
            )}
            {block.type !== "uploading" && (
              <button
                type="button"
                onClick={() => removeBlock(block.key)}
                aria-label={block.type === "photo" ? "Убрать фото" : "Убрать абзац"}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-muted shadow-sm hover:text-red-600"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── Добавить блок ── */}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={addText}
          className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-primary hover:text-primary"
        >
          + Текст
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-primary hover:text-primary"
        >
          + Фото
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
