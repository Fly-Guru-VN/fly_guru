"use client";

import { useState, useTransition } from "react";
import { showToast } from "@/components/cabinet/Toast";
import { Spinner } from "@/components/Spinner";
import {
  createJournalCategoryAction,
  deleteJournalCategoryAction,
  renameJournalCategoryAction,
  setJournalCategoryHiddenAction,
  setJournalPostCategoryAction,
} from "./actions";
import type { EditorCategory } from "./JournalEditor";

// Мелкие управляющие элементы списка журнала: смена категории поста прямо в
// строке и справочник категорий. Каждое действие сохраняется сразу, без
// кнопки «Сохранить», — как переключатели в настройках телефона.

const selectClass =
  "rounded-lg border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-primary";

export function PostCategorySelect({
  postId,
  categoryId,
  categories,
}: {
  postId: string;
  categoryId: string | null;
  categories: EditorCategory[];
}) {
  const [value, setValue] = useState(categoryId ?? "");
  const [pending, startTransition] = useTransition();
  const options = categories.filter((c) => !c.hidden || c.id === value);

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={value}
        disabled={pending}
        aria-label="Категория поста"
        onChange={(e) => {
          const next = e.target.value;
          const before = value;
          setValue(next);
          startTransition(async () => {
            const result = await setJournalPostCategoryAction(postId, next || null);
            if (result.error) {
              setValue(before);
              showToast(result.error);
            } else {
              showToast("Категория изменена");
            }
          });
        }}
        className={selectClass}
      >
        <option value="">Без категории</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {pending && <Spinner className="h-3.5 w-3.5" />}
    </span>
  );
}

export function CategoryManager({
  categories,
  postCounts,
}: {
  categories: EditorCategory[];
  postCounts: Record<string, number>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ error: string | null }>, done: string) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else showToast(done);
    });
  }

  return (
    <details className="mt-6 rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-bold">Категории</summary>
      <p className="mt-2 text-sm text-muted">
        Категорию с постами нельзя удалить — её можно убрать из списка выбора. У уже
        привязанных постов она останется.
      </p>

      <ul className="mt-3 divide-y divide-line">
        {categories.map((c) => (
          <CategoryRow
            key={c.id}
            category={c}
            posts={postCounts[c.id] ?? 0}
            disabled={pending}
            onRename={(value) => run(() => renameJournalCategoryAction(c.id, value), "Сохранено")}
            onToggle={() =>
              run(
                () => setJournalCategoryHiddenAction(c.id, !c.hidden),
                c.hidden ? "Категория вернулась в список" : "Категория убрана из списка",
              )
            }
            onDelete={() => {
              if (window.confirm(`Удалить категорию «${c.name}»?`)) {
                run(() => deleteJournalCategoryAction(c.id), "Категория удалена");
              }
            }}
          />
        ))}
      </ul>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = name;
          run(async () => {
            const result = await createJournalCategoryAction(value);
            if (!result.error) setName("");
            return result;
          }, "Категория добавлена");
        }}
      >
        <input
          type="text"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="Новая категория"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
        >
          {pending && <Spinner />}
          Добавить
        </button>
      </form>
      {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
    </details>
  );
}

function CategoryRow({
  category,
  posts,
  disabled,
  onRename,
  onToggle,
  onDelete,
}: {
  category: EditorCategory;
  posts: number;
  disabled: boolean;
  onRename: (name: string) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(category.name);
  const changed = name.trim() !== category.name;

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <input
        type="text"
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        aria-label="Название категории"
        className={`min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm outline-none hover:border-line focus:border-primary ${
          category.hidden ? "text-muted line-through" : ""
        }`}
      />
      <span className="text-xs text-muted">{posts} пост.</span>
      {changed && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRename(name)}
          className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          Сохранить
        </button>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:border-primary disabled:opacity-50"
      >
        {category.hidden ? "Вернуть" : "Убрать из списка"}
      </button>
      {posts === 0 && (
        <button
          type="button"
          disabled={disabled}
          onClick={onDelete}
          className="rounded-full px-2 py-1 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
        >
          Удалить
        </button>
      )}
    </li>
  );
}
