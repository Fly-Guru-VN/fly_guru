"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Таблица визитов на «Статистике». Раньше она печатала все строки периода
// подряд — за «Всё время» экран растягивался на тысячи строк, и всё, что ниже
// (графики, деньги по способам оплаты), уезжало за горизонт. Теперь по
// умолчанию видно первые COLLAPSED строк, остальное — по кнопке.
//
// На телефоне таблицы нет вообще: девять колонок жили в горизонтальной
// прокрутке, и всё правее «Клиента» — способ оплаты, инструктор, канал — David
// просто не видел, как и шапку с сортировкой (она уезжала вместе с колонками).
// Поэтому до md строки рисуются карточками, а сортировка вынесена в обычный
// выпадающий список. Сама сортировка по-прежнему живёт в адресе страницы:
// данные приходят с сервера уже отсортированными и отформатированными.

const COLLAPSED = 10;

export interface VisitCell {
  id: string;
  date: string;
  client: string;
  clientHref: string | null; // карточка клиента (список, отфильтрованный по имени)
  service: string;
  amount: string | null; // null — списание с абонемента, денег не было
  payment: string | null; // null — способ оплаты не проставлен
  paymentMissing: boolean; // деньги были, а способ не указан — подсвечиваем
  channel: string | null; // канал записи; null — не указан
  instructor: string;
  creator: string;
  visits: string;
  sale: boolean; // строка — продажа абонемента, а не занятие
}

export interface VisitColumn {
  key: string;
  label: string;
  href: string;
  active: boolean;
  arrow: string; // « ↑» / « ↓» у активной колонки, иначе пусто
}

// Ячейка «чем оплатил» в таблице: жёлтым — те занятия, по которым не сходится
// касса. Пустая ячейка читалась как «такого поля нет», хотя данные просто не
// внесли (та же логика, что в карточке сессии).
function PaymentText({ row }: { row: VisitCell }) {
  if (row.paymentMissing) {
    return <span className="font-semibold text-amber-600">не указан</span>;
  }
  return <>{row.payment ?? <span className="text-muted">—</span>}</>;
}

export function VisitsTable({
  columns,
  rows,
}: {
  columns: VisitColumn[];
  rows: VisitCell[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, COLLAPSED);
  const hidden = rows.length - shown.length;
  const active = columns.find((c) => c.active);

  return (
    <>
      {/* Телефон: сортировка списком. Значение — готовый адрес колонки, тот же,
          что у клика по шапке на ПК. */}
      <div className="flex items-center gap-2 px-4 pt-3 md:hidden">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted">
          Сортировка
          <select
            value={active?.key ?? "date"}
            onChange={(e) => {
              const next = columns.find((c) => c.key === e.target.value);
              if (next) router.push(next.href);
            }}
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary"
          >
            {columns.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {/* Переворот порядка — отдельной кнопкой: выбрать в списке уже
            выбранный пункт браузер не даёт (событие не приходит), а на ПК
            порядок как раз переворачивается повторным кликом по колонке. */}
        {active && (
          <Link
            href={active.href}
            aria-label="Перевернуть порядок"
            className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
          >
            {active.arrow.trim() || "↕"}
          </Link>
        )}
      </div>

      {/* Телефон: карточки вместо строк таблицы */}
      <div className="mt-2 space-y-2 px-4 pb-1 md:hidden">
        {shown.map((r) => (
          <div key={r.id} className="rounded-2xl border border-line/70 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 flex-1 truncate font-bold">
                {r.clientHref ? (
                  <Link href={r.clientHref} className="hover:text-primary">
                    {r.client}
                  </Link>
                ) : (
                  r.client
                )}
              </p>
              <p className="shrink-0 font-bold text-primary tabular-nums">
                {r.amount ?? <span className="text-muted">абонемент</span>}
              </p>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {r.date} · {r.service}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {/* У списания минут с абонемента денег в этот день не было —
                  плашка оплаты там не нужна вовсе (как в карточке сессии). */}
              {r.amount !== null && (
                <span
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold ${
                    r.paymentMissing
                      ? "bg-amber-500/10 text-amber-600"
                      : "bg-emerald-500/10 text-emerald-600"
                  }`}
                >
                  <span aria-hidden>💵</span>
                  {r.paymentMissing ? "оплата не указана" : r.payment}
                </span>
              )}
              {r.channel && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-line/50 px-2 py-0.5 text-xs font-semibold text-muted">
                  <span aria-hidden>📍</span>
                  {r.channel}
                </span>
              )}
            </div>
            {/* У продажи абонемента нет «откатал»: там один человек — тот,
                кто продал, и повторять его в двух подписях незачем. */}
            <p className="mt-1.5 text-xs text-muted">
              {r.sale
                ? `Продал: ${r.instructor}`
                : `Откатал: ${r.instructor} · записал: ${r.creator}`}{" "}
              · визитов: {r.visits}
            </p>
          </div>
        ))}
      </div>

      {/* ПК: обычная таблица с сортировкой по шапке */}
      <div className="mt-2 hidden overflow-x-auto md:block">
        <table className="w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-line/70 text-left text-xs text-muted">
              {columns.map((c) => (
                <th key={c.key} className="p-0 font-semibold">
                  <Link
                    href={c.href}
                    className={`block px-2 py-2 transition-colors hover:text-primary lg:px-3 ${
                      c.active ? "text-primary" : ""
                    }`}
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
                <td className="px-2 py-2 text-muted lg:px-3">{r.date}</td>
                <td className="max-w-40 truncate px-2 py-2 font-semibold lg:max-w-none lg:px-3">
                  {r.clientHref ? (
                    <Link href={r.clientHref} className="hover:text-primary">
                      {r.client}
                    </Link>
                  ) : (
                    r.client
                  )}
                </td>
                <td className="max-w-44 truncate px-2 py-2 lg:max-w-none lg:px-3">{r.service}</td>
                <td className="px-2 py-2 lg:px-3">
                  {r.amount ?? <span className="text-muted">—</span>}
                </td>
                <td className="max-w-32 truncate px-2 py-2 lg:max-w-none lg:px-3">
                  <PaymentText row={r} />
                </td>
                <td className="max-w-32 truncate px-2 py-2 text-muted lg:max-w-none lg:px-3">
                  {r.channel ?? "—"}
                </td>
                <td className="max-w-32 truncate px-2 py-2 lg:max-w-none lg:px-3">{r.instructor}</td>
                <td className="max-w-32 truncate px-2 py-2 text-muted lg:max-w-none lg:px-3">
                  {r.creator}
                </td>
                <td className="px-2 py-2 lg:px-3">{r.visits}</td>
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
