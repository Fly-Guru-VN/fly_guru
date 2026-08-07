"use client";

import { useState } from "react";
import Link from "next/link";

// Таблица визитов на «Статистике». Раньше она печатала все строки периода
// подряд — за «Всё время» экран растягивался на тысячи строк, и всё, что ниже
// (графики, деньги по способам оплаты), уезжало за горизонт. Теперь по
// умолчанию видно первые COLLAPSED строк, остальное — по кнопке.
//
// Компонент клиентский только ради этой кнопки: сортировка по колонкам
// по-прежнему живёт в адресе страницы (ссылки в шапке), данные приходят с
// сервера уже отсортированными и отформатированными.

const COLLAPSED = 10;

export interface VisitCell {
  id: string;
  date: string;
  client: string;
  service: string;
  amount: string | null; // null — списание с абонемента, денег не было
  payment: string | null; // null — способ оплаты не проставлен
  instructor: string;
  creator: string;
  visits: string;
}

export interface VisitColumn {
  key: string;
  label: string;
  href: string;
  active: boolean;
  arrow: string; // « ↑» / « ↓» у активной колонки, иначе пусто
}

export function VisitsTable({
  columns,
  rows,
}: {
  columns: VisitColumn[];
  rows: VisitCell[];
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, COLLAPSED);
  const hidden = rows.length - shown.length;

  return (
    <>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-line/70 text-left text-xs text-muted">
              {columns.map((c) => (
                <th key={c.key} className="p-0 font-semibold">
                  <Link
                    href={c.href}
                    className="block px-3 py-2 transition-colors hover:text-primary"
                  >
                    {c.label}
                    {c.arrow}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-line/40 last:border-0">
                <td className="px-3 py-2 text-muted">{r.date}</td>
                <td className="max-w-40 truncate px-3 py-2 font-semibold lg:max-w-none">
                  {r.client}
                </td>
                <td className="max-w-44 truncate px-3 py-2 lg:max-w-none">{r.service}</td>
                <td className="px-3 py-2">
                  {r.amount ?? <span className="text-muted">—</span>}
                </td>
                <td className="max-w-32 truncate px-3 py-2 lg:max-w-none">
                  {r.payment ?? <span className="text-muted">не указан</span>}
                </td>
                <td className="max-w-32 truncate px-3 py-2 lg:max-w-none">{r.instructor}</td>
                <td className="max-w-32 truncate px-3 py-2 text-muted lg:max-w-none">
                  {r.creator}
                </td>
                <td className="px-3 py-2">{r.visits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > COLLAPSED && (
        <div className="border-t border-line/70 p-3 text-center">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
          >
            {expanded ? "Свернуть таблицу" : `Показать все ${rows.length} — ещё ${hidden}`}
          </button>
        </div>
      )}
    </>
  );
}
