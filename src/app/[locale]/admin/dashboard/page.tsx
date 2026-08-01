import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  vnMonthToDate,
  vnPeriod,
  vnPrevMonth,
  vnShiftDays,
  vnToday,
} from "@/lib/dates";
import { vnd } from "@/lib/stats";
import { loadAllSessions } from "@/lib/sessions";
import { MANUAL_CHANNELS } from "@/lib/channels";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";

export const metadata: Metadata = { title: "Админка · Статистика" };

// Статистика (бывший дашборд): «как дела у школы» за любой период. Read-only.
// Сверху таблица визитов (строка = одно занятие) с сортировкой по колонкам
// и фильтрами по услуге/инструктору; фильтры действуют и на графики ниже.
// Правило денег: доход существует только после факта оплаты — неоплаченные
// абонементы в итоги не входят, показываются справочной строкой.

const CATEGORY_LABEL: Record<string, string> = {
  training: "Обучение",
  tandem: "Тандемы",
  rental: "Прокат",
  tour: "Экскурсии",
  subscription: "Абонементы",
  extra: "Прочее",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Новые",
  contacted: "В обработке",
  confirmed: "Подтверждены",
  done: "Выполнены",
  cancelled: "Отменены",
  archived: "В архиве",
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// «Всё время» — с даты заведомо раньше первой записи школы.
const ALL_FROM = "2020-01-01";
const TABLE_LIMIT = 100;

const presetClass = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
    active
      ? "bg-primary text-white"
      : "border border-line text-muted hover:border-primary hover:text-primary"
  }`;

interface VisitRow {
  id: string;
  date: string;
  amount: number;
  minutes_used: number | null;
  subscription_id: string | null;
  client_id: string | null;
  instructor_id: string | null;
  client: { name: string } | null;
  service: { name: string; category: string } | null;
  instructor: { name: string } | null;
  creator: { name: string } | null;
}

// Колонки таблицы: ключ ?sort=, подпись, стартовое направление.
const COLUMNS = [
  { key: "date", label: "Дата", startDir: "d" },
  { key: "client", label: "Клиент", startDir: "a" },
  { key: "service", label: "Занятие", startDir: "a" },
  { key: "amount", label: "Оплата", startDir: "d" },
  { key: "instructor", label: "Откатал", startDir: "a" },
  { key: "creator", label: "Записал", startDir: "a" },
  { key: "visits", label: "Визитов всего", startDir: "d" },
] as const;

function fmtDay(day: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

// Горизонтальный бар-список: подпись + цифра + полоса. Одна серия — один
// цвет (primary), значения текстом, легенда не нужна.
function BarList({
  title,
  items,
  caption,
}: {
  title: string;
  items: { label: string; value: number; display: string }[];
  caption?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-bold">{title}</h2>
      {items.length === 0 && <p className="mt-2 text-sm text-muted">Пока пусто.</p>}
      <div className="mt-3 space-y-3">
        {items.map((i) => (
          <div key={i.label}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-muted">{i.label}</span>
              <span className="shrink-0 font-semibold">{i.display}</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-line/50">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max((i.value / max) * 100, 2)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {caption && items.length > 0 && (
        <p className="mt-3 text-xs text-muted">{caption}</p>
      )}
    </section>
  );
}

// Ячейка итогов под таблицей.
function Total({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    cat?: string;
    inst?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const { from, to, cat = "", inst = "", sort = "date", dir = "d" } =
    await searchParams;
  const today = vnToday();
  // По умолчанию — с 1-го числа по сегодня (не месяц целиком): в полях «С / По»
  // не должно быть дат из будущего, см. vnMonthToDate.
  const month = vnMonthToDate();
  const prev = vnPrevMonth();

  // Период из URL (обе даты включительно); мусор → текущий месяц.
  const custom = Boolean(
    from && to && DAY_RE.test(from!) && DAY_RE.test(to!) && from! <= to!,
  );
  const range = custom ? vnPeriod(from!, to!) : month;
  const lastDay = custom ? to! : month.lastDay;
  const label = custom
    ? from === ALL_FROM
      ? "Всё время"
      : `${from} — ${to}`
    : month.label;

  // Ссылка на этот же экран с изменёнными параметрами (сохраняет остальные).
  const href = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    const base: Record<string, string> = { from: from ?? "", to: to ?? "", cat, inst, sort, dir };
    for (const [k, v] of Object.entries({ ...base, ...overrides })) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/admin/dashboard?${qs}` : "/admin/dashboard";
  };

  const supabase = await createClient();
  const [
    { rows: sessions },
    { rows: allSessions },
    paidSubsRes,
    unpaidSubsRes,
    clientsRes,
    bookingsRes,
  ] = await Promise.all([
    // Обе выборки постранично (lib/sessions): .limit(10000) молча срезал бы
    // и выручку периода, и счётчик визитов клиента.
    loadAllSessions<VisitRow>(
      supabase,
      "id, date, amount, minutes_used, subscription_id, client_id, instructor_id, client:clients!client_id(name), service:services!service_id(name, category), instructor:users!instructor_id(name), creator:users!created_by(name)",
      { fromDay: range.fromDay, toDay: range.toDay },
    ),
    // Все сессии школы — для колонки «визитов всего» у клиента.
    loadAllSessions<{ client_id: string | null }>(supabase, "client_id"),
    supabase
      .from("subscriptions")
      .select("price")
      .gte("paid_at", range.fromIso)
      .lt("paid_at", range.toIso),
    // Дебиторка всей школы (не периода): проданные, но неоплаченные.
    // Отменённые отсеиваем в JS ниже — с них уже никто не заплатит (п.13).
    supabase.from("subscriptions").select("price, status").is("paid_at", null),
    supabase
      .from("clients")
      .select("id")
      .gte("created_at", range.fromIso)
      .lt("created_at", range.toIso),
    supabase
      .from("bookings")
      .select("status, src, ref_code, service:services!service_id(price)")
      .gte("created_at", range.fromIso)
      .lt("created_at", range.toIso),
  ]);

  const paidSubs = paidSubsRes.data ?? [];
  const paidSubsSum = paidSubs.reduce((s, r) => s + (r.price ?? 0), 0);
  const unpaid = (unpaidSubsRes.data ?? []).filter((r) => r.status !== "cancelled");
  const unpaidSum = unpaid.reduce((s, r) => s + (r.price ?? 0), 0);

  // Визиты клиента за всё время (не за период).
  const lifetimeVisits = new Map<string, number>();
  for (const r of allSessions) {
    if (!r.client_id) continue;
    lifetimeVisits.set(
      r.client_id as string,
      (lifetimeVisits.get(r.client_id as string) ?? 0) + 1,
    );
  }
  const visitsOf = (r: VisitRow) =>
    r.client_id ? (lifetimeVisits.get(r.client_id) ?? 0) : 0;

  // Фильтры-чипсы собираем из сессий периода: только то, что реально было.
  const presentCats = [...new Set(sessions.map((r) => r.service?.category ?? ""))]
    .filter(Boolean)
    .sort();
  const presentInstructors = new Map<string, string>();
  for (const r of sessions) {
    if (r.instructor_id) {
      presentInstructors.set(r.instructor_id, r.instructor?.name ?? "—");
    }
  }

  const filtered = sessions.filter(
    (r) =>
      (!cat || (r.service?.category ?? "") === cat) &&
      (!inst || r.instructor_id === inst),
  );

  // Сортировка таблицы.
  const dirMul = dir === "a" ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case "client":
        return dirMul * (a.client?.name ?? "").localeCompare(b.client?.name ?? "", "ru");
      case "service":
        return dirMul * (a.service?.name ?? "").localeCompare(b.service?.name ?? "", "ru");
      case "amount":
        return dirMul * (a.amount - b.amount);
      case "instructor":
        return dirMul * (a.instructor?.name ?? "").localeCompare(b.instructor?.name ?? "", "ru");
      case "creator":
        return dirMul * (a.creator?.name ?? "").localeCompare(b.creator?.name ?? "", "ru");
      case "visits":
        return dirMul * (visitsOf(a) - visitsOf(b));
      default:
        return dirMul * a.date.localeCompare(b.date);
    }
  });
  const shown = sorted.slice(0, TABLE_LIMIT);

  // Итоги под таблицей — по всем отфильтрованным строкам, не только показанным.
  const tSum = filtered.reduce((s, r) => s + r.amount, 0);
  const tClients = new Set(filtered.map((r) => r.client_id).filter(Boolean)).size;
  const tPaidCount = filtered.filter((r) => r.amount > 0).length;
  const tAvg = tPaidCount > 0 ? Math.round(tSum / tPaidCount) : 0;
  const tMinutes = filtered.reduce(
    (s, r) => s + (r.subscription_id ? (r.minutes_used ?? 0) : 0),
    0,
  );

  // Заявки периода: воронка, источники, потерянная прибыль с отменённых.
  const bookings = (bookingsRes.data ?? []) as unknown as {
    status: string;
    src: string | null;
    ref_code: string | null;
    service: { price: number | null } | null;
  }[];
  const byStatus = new Map<string, number>();
  const bySource = new Map<string, number>();
  let lostSum = 0;
  for (const b of bookings) {
    byStatus.set(b.status, (byStatus.get(b.status) ?? 0) + 1);
    // Ручные каналы (звонок/мессенджер/пришёл сам) показываем по-человечески,
    // сайтовые метки — как есть: «src: instagram».
    const source = b.ref_code
      ? "по реф-ссылке"
      : b.src
        ? (MANUAL_CHANNELS[b.src] ?? `src: ${b.src}`)
        : "прямые";
    bySource.set(source, (bySource.get(source) ?? 0) + 1);
    if (b.status === "cancelled") lostSum += b.service?.price ?? 0;
  }
  const doneCount = byStatus.get("done") ?? 0;
  const cancelledCount = byStatus.get("cancelled") ?? 0;

  // Данные графиков — из отфильтрованных сессий (фильтры «двигают» графики).
  const byCategory = new Map<string, number>();
  const byService = new Map<string, number>();
  const byInstructor = new Map<string, { count: number; sum: number }>();
  const byDay = new Map<string, { sum: number; count: number }>();
  // Период длиннее ~5 недель — динамика по месяцам, иначе по дням.
  const spanDays =
    (Date.parse(range.toDay) - Date.parse(range.fromDay)) / 86400000;
  const monthly = spanDays > 35;
  for (const r of filtered) {
    const c = r.service?.category ?? "extra";
    byCategory.set(c, (byCategory.get(c) ?? 0) + r.amount);
    const svc = r.service?.name ?? "без услуги";
    byService.set(svc, (byService.get(svc) ?? 0) + 1);
    const iName = r.instructor?.name ?? "—";
    const acc = byInstructor.get(iName) ?? { count: 0, sum: 0 };
    acc.count += 1;
    acc.sum += r.amount;
    byInstructor.set(iName, acc);
    const bucket = monthly ? r.date.slice(0, 7) : r.date;
    const d = byDay.get(bucket) ?? { sum: 0, count: 0 };
    d.sum += r.amount;
    d.count += 1;
    byDay.set(bucket, d);
  }
  // Оплаченные абонементы — отдельная строка категорий (только без фильтров,
  // к конкретной услуге/инструктору их не привязать).
  if (!cat && !inst && paidSubsSum > 0) {
    byCategory.set("subscription", (byCategory.get("subscription") ?? 0) + paidSubsSum);
  }

  const catItems = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ label: CATEGORY_LABEL[k] ?? k, value: v, display: vnd(v) }));
  const svcItems = [...byService.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([k, v]) => ({ label: k, value: v, display: `${v} зан.` }));
  const instItems = [...byInstructor.entries()]
    .sort((a, b) => b[1].sum - a[1].sum)
    .map(([k, v]) => ({
      label: `${k} · ${v.count} занятий`,
      value: v.sum,
      display: vnd(v.sum),
    }));
  const statusItems = Object.entries(STATUS_LABEL)
    .filter(([s]) => byStatus.has(s))
    .map(([s, l]) => ({ label: l, value: byStatus.get(s)!, display: String(byStatus.get(s)) }));
  const sourceItems = [...bySource.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ label: k, value: v, display: String(v) }));

  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const dayMax = Math.max(...days.map(([, d]) => d.sum), 1);
  const bestDay = days.reduce(
    (best, cur) => (cur[1].sum > best[1].sum ? cur : best),
    ["", { sum: -1, count: 0 }] as (typeof days)[number],
  );
  const bucketLabel = (key: string) =>
    monthly
      ? new Intl.DateTimeFormat("ru-RU", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${key}-01T00:00:00Z`))
      : fmtDay(key);

  const catBase = { sort, dir }; // фильтры сбрасывать сортировку не должны

  return (
    // Ширину задаёт колонка контента в layout кабинета (как у остальных
    // вкладок) — отдельного «вырывания» на всю ширину больше нет.
    <div>
      <h1 className="text-2xl font-bold">Статистика</h1>
      <p className="mt-1 text-sm text-muted first-letter:uppercase">{label}</p>

      {/* Пресеты периода + свой период */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Link href={href({ from: "", to: "" })} className={presetClass(!custom)}>
          Этот месяц
        </Link>
        <Link
          href={href({ from: prev.fromDay, to: prev.lastDay })}
          className={presetClass(custom && from === prev.fromDay && to === prev.lastDay)}
        >
          Прошлый месяц
        </Link>
        <Link
          href={href({ from: vnShiftDays(today, -6), to: today })}
          className={presetClass(custom && from === vnShiftDays(today, -6) && to === today)}
        >
          7 дней
        </Link>
        <Link
          href={href({ from: vnShiftDays(today, -29), to: today })}
          className={presetClass(custom && from === vnShiftDays(today, -29) && to === today)}
        >
          30 дней
        </Link>
        <Link
          href={href({ from: ALL_FROM, to: today })}
          className={presetClass(custom && from === ALL_FROM)}
        >
          Всё время
        </Link>
      </div>

      {/* Два компактных поля дат стоят рядом, кнопка «Показать» — под ними во
          всю их ширину. w-fit прижимает весь блок к левому краю, в одну линию
          с кнопками «Этот месяц» сверху и «Все услуги» снизу (пачка №5, п.8).
          Сами поля без w-full/flex-1, иначе нативный датапикер растягивается
          и вылезает за экран. */}
      <form className="mt-3 flex w-fit flex-col gap-3" action="">
        {cat && <input type="hidden" name="cat" value={cat} />}
        {inst && <input type="hidden" name="inst" value={inst} />}
        <div className="flex items-end gap-2">
          <label className="flex flex-col items-start text-xs text-muted">
            С
            <input
              type="date"
              name="from"
              defaultValue={range.fromDay}
              max={today}
              className={`mt-1 ${NATIVE_PICKER} rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary`}
            />
          </label>
          <label className="flex flex-col items-start text-xs text-muted">
            По
            <input
              type="date"
              name="to"
              defaultValue={lastDay}
              max={today}
              className={`mt-1 ${NATIVE_PICKER} rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary`}
            />
          </label>
        </div>
        <button
          type="submit"
          className="w-full rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
        >
          Показать
        </button>
      </form>

      {/* Фильтры: действуют на таблицу и графики занятий */}
      {sessions.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            <Link href={href({ ...catBase, cat: "" })} className={presetClass(!cat)}>
              Все услуги
            </Link>
            {presentCats.map((c) => (
              <Link key={c} href={href({ ...catBase, cat: c })} className={presetClass(cat === c)}>
                {CATEGORY_LABEL[c] ?? c}
              </Link>
            ))}
          </div>
          {presentInstructors.size > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <Link href={href({ ...catBase, inst: "" })} className={presetClass(!inst)}>
                Все инструкторы
              </Link>
              {[...presentInstructors.entries()].map(([id, name]) => (
                <Link key={id} href={href({ ...catBase, inst: id })} className={presetClass(inst === id)}>
                  {name}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Таблица визитов: строка = одно занятие */}
      <section className="mt-4 rounded-2xl border border-line bg-surface">
        <div className="flex items-baseline justify-between gap-2 p-4 pb-0">
          <h2 className="font-bold">Визиты за период</h2>
          <p className="text-xs text-muted">
            {filtered.length > TABLE_LIMIT
              ? `показаны ${TABLE_LIMIT} из ${filtered.length}`
              : `всего: ${filtered.length}`}
          </p>
        </div>

        {filtered.length === 0 ? (
          <p className="p-4 pt-2 text-sm text-muted">За этот период занятий не было.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-line/70 text-left text-xs text-muted">
                  {COLUMNS.map((c) => {
                    const active = sort === c.key;
                    // Клик по активной колонке разворачивает направление.
                    const nextDir = active ? (dir === "a" ? "d" : "a") : c.startDir;
                    return (
                      <th key={c.key} className="p-0 font-semibold">
                        <Link
                          href={href({ sort: c.key, dir: nextDir })}
                          className="block px-3 py-2 transition-colors hover:text-primary"
                        >
                          {c.label}
                          {active && (dir === "a" ? " ↑" : " ↓")}
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {shown.map((r) => (
                  <tr key={r.id} className="border-b border-line/40 last:border-0">
                    <td className="px-3 py-2 text-muted">{fmtDay(r.date)}</td>
                    <td className="max-w-40 truncate px-3 py-2 font-semibold lg:max-w-none">
                      {r.client?.name ?? "—"}
                    </td>
                    <td className="max-w-44 truncate px-3 py-2 lg:max-w-none">
                      {r.subscription_id
                        ? `Абонемент · ${r.minutes_used ?? 0} мин`
                        : (r.service?.name ?? "—")}
                    </td>
                    <td className="px-3 py-2">
                      {r.amount > 0 ? vnd(r.amount) : <span className="text-muted">—</span>}
                    </td>
                    <td className="max-w-32 truncate px-3 py-2 lg:max-w-none">{r.instructor?.name ?? "—"}</td>
                    <td className="max-w-32 truncate px-3 py-2 text-muted lg:max-w-none">
                      {r.creator?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2">{visitsOf(r) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="grid grid-cols-2 gap-3 border-t border-line/70 p-4 sm:grid-cols-5">
            <Total label="Выручка (сессии)" value={vnd(tSum)} />
            <Total label="Визитов" value={String(filtered.length)} />
            <Total label="Клиентов" value={String(tClients)} />
            <Total label="Средний чек" value={vnd(tAvg)} />
            <Total label="Списано минут" value={`${tMinutes} мин`} />
          </div>
        )}
      </section>

      {/* Итоги и графики: на телефоне — колонкой, на ПК — сеткой в 2–3 ряда
          с увеличенными отступами, чтобы блоки читались раздельно. */}
      <div className="mt-3 grid gap-3 lg:mt-6 lg:grid-cols-2 lg:gap-6 xl:grid-cols-3">
        {/* Итоги периода — без фильтров, деньги только по факту оплаты */}
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs text-muted">Выручка за период · только оплаченное</p>
          <p className="mt-1 text-3xl font-bold text-primary">
            {vnd(sessions.reduce((s, r) => s + r.amount, 0) + paidSubsSum)}
          </p>
          <div className="mt-3 space-y-1 text-sm text-muted">
            <p>
              Сессии ({sessions.length}):{" "}
              <span className="font-semibold text-ink">
                {vnd(sessions.reduce((s, r) => s + r.amount, 0))}
              </span>
            </p>
            <p>
              Оплачено абонементов ({paidSubs.length}):{" "}
              <span className="font-semibold text-ink">{vnd(paidSubsSum)}</span>
            </p>
            <p>
              Новых клиентов: {(clientsRes.data ?? []).length} · заявок: {bookings.length}{" "}
              (выполнено {doneCount}, отменено {cancelledCount})
            </p>
            {lostSum > 0 && (
              <p>
                Потенциально потеряно на отменённых заявках:{" "}
                <span className="font-semibold text-ink">{vnd(lostSum)}</span>
              </p>
            )}
          </div>
          {unpaid.length > 0 && (
            <p className="mt-3 border-t border-line/70 pt-2 text-xs text-muted">
              Ожидают оплату: {unpaid.length} абонемент(а) на {vnd(unpaidSum)} — в итоги
              не входят (всего по школе).
            </p>
          )}
        </div>

        {/* Динамика по дням/месяцам — на широком экране занимает два столбца */}
        {days.length > 1 && (
          <section className="rounded-2xl border border-line bg-surface p-4 xl:col-span-2">
            <h2 className="font-bold">{monthly ? "Выручка по месяцам" : "Выручка по дням"}</h2>
            <div className="mt-3 flex h-28 items-end gap-0.5 overflow-x-auto lg:h-40">
              {days.map(([key, d]) => (
                <div
                  key={key}
                  className="flex min-w-2 flex-1 flex-col items-center justify-end self-stretch"
                  title={`${bucketLabel(key)}: ${vnd(d.sum)} · ${d.count} зан.`}
                >
                  <div
                    className={`w-full rounded-t ${d.sum === bestDay[1].sum ? "bg-primary" : "bg-primary/60"}`}
                    style={{ height: `${Math.max((d.sum / dayMax) * 100, 3)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>{bucketLabel(days[0][0])}</span>
              <span>{bucketLabel(days[days.length - 1][0])}</span>
            </div>
            <p className="mt-2 text-xs text-muted">
              Лучший {monthly ? "месяц" : "день"}: {bucketLabel(bestDay[0])} —{" "}
              <span className="font-semibold text-ink">{vnd(bestDay[1].sum)}</span> (
              {bestDay[1].count} зан.). Наведите на столбик, чтобы увидеть цифры.
            </p>
          </section>
        )}

        <BarList
          title="Выручка по категориям"
          items={catItems}
          caption={`Всего: ${vnd(catItems.reduce((s, i) => s + i.value, 0))}. Длина полосы — доля категории.`}
        />
        <BarList
          title="Топ услуг по количеству занятий"
          items={svcItems}
          caption={`Всего занятий за период: ${filtered.length}.`}
        />
        <BarList
          title="Инструкторы: выручка и занятия"
          items={instItems}
          caption="Длина полосы — выручка инструктора; количество занятий — в подписи."
        />
        <BarList
          title="Заявки: статусы"
          items={statusItems}
          caption={`Всего заявок за период: ${bookings.length}. Фильтры услуг на заявки не действуют.`}
        />
        <BarList
          title="Заявки: источники"
          items={sourceItems}
          caption="Откуда пришла заявка: реф-ссылка агента, метка src или напрямую с сайта."
        />
      </div>
    </div>
  );
}
