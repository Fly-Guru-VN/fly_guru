import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { loadAllClients } from "@/lib/clients";
import { loadAllSessions } from "@/lib/sessions";
import { phoneDigits } from "@/lib/phone";
import { vnd } from "@/lib/stats";
import { updateClientAction } from "../actions";
import { SaveForm } from "../SaveForm";
import { ClientPhoto } from "./ClientPhoto";
import { PageHeader } from "@/components/cabinet/PageHeader";

export const metadata: Metadata = { title: "Админка · Клиенты" };

// База клиентов: поиск по имени/телефону, карточка с историей трат,
// абонементами и внутренней заметкой. Клиенты появляются сами — из
// оформлений инструктора и продаж; руками их создавать не нужно.

interface ClientRow {
  id: string;
  name: string;
  phone: string | null;
  source: string;
  referrer_type: string | null;
  referrer_id: string | null;
  internal_note: string | null;
  age: number | null;
  city: string | null;
  tour_approved: boolean;
  telegram_username: string | null;
  photo_url: string | null;
  created_at: string;
}

// Три поля сессии, из которых считаются занятия, траты и последний визит.
interface SessionRow {
  client_id: string | null;
  amount: number | null;
  date: string;
}

// Сортировки списка. Ключ — значение ?sort=, подпись — текст чипса.
const SORTS = [
  { key: "", label: "Новые" },
  { key: "sessions", label: "По занятиям" },
  { key: "spent", label: "По тратам" },
  { key: "visit", label: "По визиту" },
  { key: "age", label: "По возрасту" },
] as const;

const SOURCE_LABEL: Record<string, string> = {
  site: "с сайта",
  offline: "офлайн",
  agent: "от агента",
  member: "по рекомендации члена клуба",
};

const PAGE_SIZE = 50;

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
}

interface ClientStats {
  sessions: number;
  spent: number;
  lastVisit: string | null;
  activeSubs: number;
  member: boolean;
  agentName: string | null;
}

// Ширины колонок свёрнутой строки. Один и тот же шаблон у карточки и у шапки
// списка — иначе подписи разъезжаются с числами (10.08.2026, ревизия визуала).
const ROW_COLS =
  "xl:grid xl:grid-cols-[minmax(0,1fr)_9rem_5.5rem_8rem_6.5rem] xl:items-center xl:gap-3";

// Шапка списка на ПК: без неё колонки читаются как случайные числа.
function ClientsHead() {
  return (
    <div className="mt-3 hidden items-center gap-2 px-4 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted xl:flex">
      <div className="w-9 shrink-0" />
      <div className={`min-w-0 flex-1 ${ROW_COLS}`}>
        <span>Клиент</span>
        <span>Телефон</span>
        <span className="text-right">Занятий</span>
        <span className="text-right">Потратил</span>
        <span className="text-right">Был</span>
      </div>
      <div className="w-44 shrink-0" />
      <div className="w-4 shrink-0" />
    </div>
  );
}

function ClientCard({ c, stats }: { c: ClientRow; stats: ClientStats }) {
  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 [&::-webkit-details-marker]:hidden">
        {/* Миниатюра в свёрнутой строке: админ узнаёт человека в лицо,
            не раскрывая карточку (пак B, пункт 7). Без фото — кружок с
            буквой: место занято всегда, иначе строки без фото сдвигались
            влево и колонки переставали стоять друг под другом. */}
        {c.photo_url ? (
          <Image
            src={c.photo_url}
            alt={c.name}
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-line/40 text-sm font-bold text-muted"
          >
            {c.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <div className={`min-w-0 flex-1 ${ROW_COLS}`}>
          <p className="truncate font-bold">
            {stats.member && <span title="Член клуба">⭐ </span>}
            {c.name}
          </p>
          {/* ПК: те же данные колонками — глаз сравнивает клиентов сверху
              вниз, а не выдёргивает числа из строки через « · ». */}
          <p className="hidden truncate text-sm text-muted xl:block">
            {c.phone ?? "—"}
          </p>
          <p className="hidden text-right text-sm tabular-nums text-muted xl:block">
            {stats.sessions || "—"}
          </p>
          <p className="hidden text-right text-sm font-semibold tabular-nums xl:block">
            {stats.spent > 0 ? vnd(stats.spent) : "—"}
          </p>
          {/* Последний визит раньше лежал внутри карточки, хотя смотрят на
              него первым — «когда человек был у нас последний раз». */}
          <p className="hidden text-right text-sm tabular-nums text-muted xl:block">
            {stats.lastVisit ? fmtDay(stats.lastVisit) : "—"}
          </p>
          <p className="truncate text-xs text-muted xl:hidden">
            {[
              c.phone,
              `${stats.sessions} занятий`,
              stats.spent > 0 ? vnd(stats.spent) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {/* Фиксированная ширина на ПК — чтобы бейджи не сдвигали колонку
            «Был» у тех строк, где бейджей нет. */}
        <div className="flex shrink-0 items-center gap-1.5 xl:w-44 xl:justify-end">
          {c.tour_approved && (
            <span
              title="Допущен к выездам (экскурсия/сафари)"
              className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent-strong"
            >
              🏝 Выезды
            </span>
          )}
          {stats.activeSubs > 0 && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
              Абонемент
            </span>
          )}
        </div>
        <span className="w-4 shrink-0 text-center text-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      <div className="border-t border-line/70 p-4 pt-3">
        <div className="space-y-0.5 text-sm text-muted">
          {c.phone && (
            <a href={`tel:${c.phone}`} className="text-primary underline">
              {c.phone}
            </a>
          )}
          {c.telegram_username && (
            <a
              href={`https://t.me/${c.telegram_username}`}
              target="_blank"
              rel="noreferrer"
              className="block text-primary underline"
            >
              @{c.telegram_username}
            </a>
          )}
          <p>
            Источник: {SOURCE_LABEL[c.source] ?? c.source}
            {stats.agentName && ` — ${stats.agentName}`}
          </p>
          <p>
            В базе с {fmtDay(c.created_at)}
            {c.age !== null && ` · ${c.age} лет`}
            {c.city && ` · ${c.city}`}
          </p>
          <p>
            Занятий: {stats.sessions} · потратил{" "}
            <span className="font-bold text-ink">{vnd(stats.spent)}</span>
            {stats.lastVisit && ` · был ${fmtDay(stats.lastVisit)}`}
          </p>
        </div>

        <div className="mt-3">
          <ClientPhoto clientId={c.id} photoUrl={c.photo_url} name={c.name} />
        </div>

        <SaveForm action={updateClientAction} className="mt-3">
          <input type="hidden" name="id" value={c.id} />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              Имя
              <input
                type="text"
                name="name"
                defaultValue={c.name}
                required
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-muted">
              Телефон *
              <input
                type="tel"
                name="phone"
                defaultValue={c.phone ?? ""}
                required
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-muted">
              Возраст
              <input
                type="number"
                name="age"
                min={1}
                max={120}
                defaultValue={c.age ?? ""}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-muted">
              Город
              <input
                type="text"
                name="city"
                defaultValue={c.city ?? ""}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>
          <label className="mt-2 block text-xs text-muted">
            Ник в Telegram · необязательно
            <input
              type="text"
              name="telegramUsername"
              defaultValue={c.telegram_username ?? ""}
              placeholder="@nickname"
              autoCapitalize="off"
              autoCorrect="off"
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="mt-2 block text-xs text-muted">
            Внутренняя заметка (клиент не видит)
            <textarea
              name="note"
              rows={2}
              defaultValue={c.internal_note ?? ""}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="tour_approved"
              value="1"
              defaultChecked={c.tour_approved}
              className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
            />
            <span>
              🏝 Допущен к выездам
              <span className="text-muted"> · экскурсия/сафари без абонемента</span>
            </span>
          </label>
          <button
            type="submit"
            className="mt-3 rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
          >
            Сохранить
          </button>
        </SaveForm>
      </div>
    </details>
  );
}

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const { q = "", sort = "" } = await searchParams;
  const supabase = await createClient();

  // Сессии тянем по ВСЕМ клиентам сразу (не по показанным): сортировка по
  // занятиям/тратам/визиту должна ранжировать весь список, а не первые 50.
  const [{ rows: allClients }, { rows: allSessions }] = await Promise.all([
    // Постранично (lib/clients): .limit(1000) молча обрезал бы базу клиентов —
    // поиск переставал бы находить всех, кто не попал в первую тысячу.
    loadAllClients<ClientRow>(
      supabase,
      "id, name, phone, source, referrer_type, referrer_id, internal_note, age, city, tour_approved, telegram_username, photo_url, created_at",
    ),
    // Тоже постранично (lib/sessions): .limit(10000) молча занизил бы
    // и число занятий, и сумму трат у клиентов.
    loadAllSessions<SessionRow>(supabase, "client_id, amount, date"),
  ]);
  // Загрузчик отдаёт по id — восстанавливаем прежний порядок «новые сверху».
  const all = [...allClients].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  // Поиск в JS: телефоны в базе разноформатные, сравниваем цифры с цифрами,
  // имя — без учёта регистра. На сотнях клиентов это дешевле индексов.
  const needle = q.trim().toLowerCase();
  const needleDigits = phoneDigits(needle);
  const found = needle
    ? all.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          (needleDigits.length >= 3 &&
            phoneDigits(c.phone ?? "").includes(needleDigits)),
      )
    : all;

  const statsById = new Map<string, ClientStats>();
  const stat = (id: string): ClientStats => {
    let s = statsById.get(id);
    if (!s) {
      s = { sessions: 0, spent: 0, lastVisit: null, activeSubs: 0, member: false, agentName: null };
      statsById.set(id, s);
    }
    return s;
  };
  for (const r of allSessions) {
    const s = stat(r.client_id as string);
    s.sessions += 1;
    s.spent += (r.amount as number) ?? 0;
    const d = r.date as string;
    if (!s.lastVisit || d > s.lastVisit) s.lastVisit = d;
  }

  // Сортировка. «Новые» — как пришло из базы (created_at desc). Метрики — по
  // убыванию; клиенты без значения (нет визитов / возраст не указан) — в конце.
  const sorted = [...found];
  if (sort === "sessions") {
    sorted.sort((a, b) => stat(b.id).sessions - stat(a.id).sessions);
  } else if (sort === "spent") {
    sorted.sort((a, b) => stat(b.id).spent - stat(a.id).spent);
  } else if (sort === "visit") {
    sorted.sort((a, b) =>
      (stat(b.id).lastVisit ?? "").localeCompare(stat(a.id).lastVisit ?? ""),
    );
  } else if (sort === "age") {
    sorted.sort((a, b) => (b.age ?? -1) - (a.age ?? -1));
  }
  const shown = sorted.slice(0, PAGE_SIZE);
  const ids = shown.map((c) => c.id);

  // Остальные агрегаты (бейджи) — батчами только по показанным клиентам.
  const agentIds = shown
    .filter((c) => c.referrer_type === "agent" && c.referrer_id)
    .map((c) => c.referrer_id as string);

  const [subsRes, membersRes, agentsRes] = await Promise.all([
    ids.length
      ? supabase
          .from("subscriptions")
          .select("client_id, status")
          .in("client_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from("memberships").select("client_id").in("client_id", ids)
      : Promise.resolve({ data: [] }),
    agentIds.length
      ? supabase
          .from("agents")
          .select("id, ref_code, user:users!user_id(name)")
          .in("id", agentIds)
      : Promise.resolve({ data: [] }),
  ]);
  for (const r of subsRes.data ?? []) {
    if (r.status === "active") stat(r.client_id as string).activeSubs += 1;
  }
  for (const r of membersRes.data ?? []) {
    stat(r.client_id as string).member = true;
  }
  const agentById = new Map(
    (agentsRes.data ?? []).map((a) => [
      a.id as string,
      `${(a.user as unknown as { name: string } | null)?.name ?? "агент"} (${a.ref_code})`,
    ]),
  );
  for (const c of shown) {
    if (c.referrer_type === "agent" && c.referrer_id) {
      stat(c.id).agentName = agentById.get(c.referrer_id) ?? null;
    }
  }

  return (
    <div>
      <PageHeader
        title="Клиенты"
        hint="Все, кто хоть раз занимался или покупал. Ищите по имени или телефону."
      />

      {/* Поиск и сортировка — одной строкой на ПК: тремя ярусами подряд они
          отжимали список вниз, хотя вкладку открывают ради списка. */}
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <form className="flex gap-2 lg:w-96">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Имя или телефон…"
          className={inputClass}
        />
        {sort && <input type="hidden" name="sort" value={sort} />}
        <button
          type="submit"
          className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
        >
          Найти
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {SORTS.map((s) => {
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          if (s.key) params.set("sort", s.key);
          const qs = params.toString();
          return (
            <Link
              key={s.key}
              href={qs ? `/admin/clients?${qs}` : "/admin/clients"}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                sort === s.key
                  ? "bg-primary text-white"
                  : "border border-line text-muted hover:border-primary hover:text-primary"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </div>
      </div>

      <p className="mt-4 text-sm text-muted">
        {found.length === all.length
          ? `Всего: ${all.length}`
          : `Найдено: ${found.length}`}
        {found.length > PAGE_SIZE && ` · показаны первые ${PAGE_SIZE}`}
      </p>

      {shown.length === 0 && (
        <p className="mt-4 text-sm text-muted">Никого не нашли.</p>
      )}
      {shown.length > 0 && <ClientsHead />}
      <div className="mt-3 space-y-3 xl:mt-1">
        {shown.map((c) => (
          <ClientCard key={c.id} c={c} stats={stat(c.id)} />
        ))}
      </div>
    </div>
  );
}
