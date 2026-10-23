"use client";

import { useEffect, useRef, useState } from "react";
import { CLIENT_BOT_URL } from "@/lib/site";
import {
  createMemberLinkAction,
  searchLinkClientsAction,
} from "@/app/[locale]/admin/memberLinkActions";
import type { LinkClientOption } from "@/lib/memberLink";

// Плашка над лентой заявок/записей: ссылка на кабинет клиента в Telegram.
//
// По умолчанию — общая ссылка на бота: человек жмёт «Поделиться номером», и
// если Telegram заведён на тот же номер, что в карточке, всё готово.
// Если номер другой — сотрудник находит клиента по имени или телефону, и
// плашка выдаёт личную одноразовую ссылку (0071). Она живёт только в памяти
// страницы: обновили страницу — плашка снова пустая, следующая ссылка новая.
export function MemberLinkBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkClientOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<{ name: string; url: string } | null>(null);
  const [making, setMaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const seq = useRef(0);

  // Поиск с паузой: не дёргаем сервер на каждую букву, и ответ на старый
  // запрос не перетирает ответ на свежий.
  useEffect(() => {
    const q = query.trim();
    const mySeq = ++seq.current;
    // Короче двух букв список и так не показывается — сервер не трогаем.
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      const res = await searchLinkClientsAction(q);
      if (mySeq !== seq.current) return;
      setSearching(false);
      setResults(res.clients);
      setError(res.error);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  async function pick(c: LinkClientOption) {
    setMaking(true);
    setError(null);
    const res = await createMemberLinkAction(c.id);
    setMaking(false);
    if (!res.url) {
      setError(res.error);
      return;
    }
    setPicked({ name: c.name, url: res.url });
    setQuery("");
    setResults([]);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(picked?.url ?? CLIENT_BOT_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Клипборд недоступен — ссылка видна рядом, скопируют руками.
    }
  }

  const url = picked?.url ?? CLIENT_BOT_URL;

  return (
    <div className="mb-4 rounded-2xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs font-semibold text-muted">
          {picked ? (
            <>
              Личная ссылка для <span className="text-ink">{picked.name}</span>
              <span className="font-normal"> · одна на вход, сутки</span>
            </>
          ) : (
            "Кабинет клиента в Telegram"
          )}
        </p>
        {picked && (
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="shrink-0 text-xs font-semibold text-muted transition-colors hover:text-primary"
          >
            Сбросить
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          {url}
        </p>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {copied ? "Скопировано ✓" : "Скопировать"}
        </button>
      </div>

      {!picked && (
        <div className="relative mt-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Telegram на другой номер? Имя или телефон клиента"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
          {query.trim().length >= 2 && (
            <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
              {searching && results.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted">Ищу…</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted">Никого не нашли</p>
              ) : (
                results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={making}
                    onClick={() => pick(c)}
                    className="flex w-full items-baseline justify-between gap-3 border-b border-line/60 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-primary/5 disabled:opacity-50"
                  >
                    <span className="min-w-0 truncate font-semibold">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted">{c.phone ?? "без телефона"}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs font-semibold text-red-500">{error}</p>}
    </div>
  );
}
