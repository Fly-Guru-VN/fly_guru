"use client";

import { useState } from "react";

// Ссылка с кнопкой копирования (реф-ссылки агентов, инвайты членов клуба).
// Домен берём из window.location — одна и та же кнопка работает на локалке,
// превью и проде без env-переменных.
//
// note — короткая подпись слева от адреса: у одного канала ссылок бывает две
// («на сайт» и «на запись»), и без подписи их не различить.

export function CopyLink({ path, note }: { path: string; note?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Клипборд недоступен (старый браузер / http) — путь виден рядом,
      // человек скопирует руками.
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {note && (
        <span className="w-16 shrink-0 text-xs font-semibold text-muted">{note}</span>
      )}
      <code className="min-w-0 truncate rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-semibold text-primary">
        {path}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
      >
        {copied ? "Скопировано ✓" : "Скопировать"}
      </button>
    </div>
  );
}
