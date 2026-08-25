"use client";

import { useState } from "react";

// Готовый текст с кнопкой «Скопировать». Агент не пишет гостю сам — он берёт
// заготовку и вставляет её в WhatsApp или Zalo.
//
// Текст показываем целиком, а не прячем за кнопкой: агент должен видеть, что
// именно отправит от имени школы. Кнопка при этом главная — на телефоне
// выделять текст пальцем неудобно, а промахнувшись, копируешь половину.
export function CopyText({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Клипборд недоступен (старый браузер / http) — текст виден рядом,
      // человек скопирует руками.
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-bold">{title}</p>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
        >
          {copied ? "Скопировано ✓" : "Скопировать"}
        </button>
      </div>
      {/* whitespace-pre-line: в заготовках есть переносы строк, и в сообщении
          они должны остаться такими же. */}
      <p className="mt-2 whitespace-pre-line text-sm text-muted">{text}</p>
    </div>
  );
}
