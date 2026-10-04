"use client";

import { useState } from "react";
import { JournalCard } from "./JournalCard";
import type { JournalCard as JournalCardData } from "@/lib/journalData";

// Лента журнала с фильтром по категориям.
//
// Фильтр работает в браузере, а не адресом ?c=…: все карточки уже лежат в
// HTML (поисковик видит каждую), страница остаётся статичной и отдаётся из
// кэша. Отдельные адреса категорий понадобятся, только если категорий и
// постов станет много — тогда это будут свои страницы, а не параметр.
export function JournalFeed({ posts, allLabel }: { posts: JournalCardData[]; allLabel: string }) {
  const [active, setActive] = useState<string | null>(null);
  // Только категории, в которых есть посты, в порядке первого появления.
  const categories = [...new Set(posts.map((p) => p.category).filter((c): c is string => !!c))];
  const shown = active ? posts.filter((p) => p.category === active) : posts;

  return (
    <>
      {categories.length > 1 && (
        <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              onClick={() => setActive(c)}
              aria-pressed={active === c}
              lang={c ? "ru" : undefined}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                active === c
                  ? "bg-primary text-white"
                  : "border border-line bg-surface text-ink hover:border-primary hover:text-primary"
              }`}
            >
              {c ?? allLabel}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((post) => (
          <JournalCard key={post.slug} post={post} />
        ))}
      </div>
    </>
  );
}
