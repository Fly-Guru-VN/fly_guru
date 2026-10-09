// Экран «Клиенты» — общий для админа и СММщика (кабинет /smm). База клиентов
// одна на школу, и держать её в двух экземплярах кода незачем: базовый путь
// для ссылок приходит параметром.
import Link from "next/link";
import { momentDay } from "@/lib/dates";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import {
  loadClientList,
  selectIn,
  SOURCE_LABEL,
  type ClientListRow,
} from "@/lib/clientList";
import { vnd } from "@/lib/stats";
import { updateClientAction } from "../actions";
import { SaveForm } from "../SaveForm";
import { ClientPhoto } from "./ClientPhoto";
import { BONUS_SERVICE_CODE } from "@/lib/referralTerms";
import { PageHeader } from "@/components/cabinet/PageHeader";
import {
  createPrivatePhotoUrls,
  privatePhotoPath,
} from "@/lib/privateStorage";

// База клиентов: поиск по имени/телефону, карточка с историей трат,
// абонементами и внутренней заметкой. Клиенты появляются сами — из
// оформлений инструктора и продаж; руками их создавать не нужно.

type ClientRow = ClientListRow;

// Сортировки списка. Ключ — значение ?sort=, подпись — текст чипса.
const SORTS = [
  { key: "", label: "Новые" },
  { key: "sessions", label: "По занятиям" },
  { key: "spent", label: "По тратам" },
  { key: "visit", label: "По визиту" },
  { key: "age", label: "По возрасту" },
] as const;

// Сколько клиентов на экране сразу и сколько добавляет «Показать ещё».
const PAGE_SIZE = 50;

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

interface ClientStats {
  sessions: number;
  spent: number;
  lastVisit: string | null;
  activeSubs: number;
  member: boolean;
  // Кто привёл: агент или клиент — член клуба (0063).
  referrerName: string | null;
  // Бонусные минуты за приглашённых друзей: null — не приглашал и не тратил.
  bonusLeft: number | null;
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

function ClientCard({
  c,
  stats,
  photoUrl,
}: {
  c: ClientRow;
  stats: ClientStats;
  photoUrl: string | null;
}) {
  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 [&::-webkit-details-marker]:hidden">
        {/* Миниатюра в свёрнутой строке: админ узнаёт человека в лицо,
            не раскрывая карточку (пак B, пункт 7). Без фото — кружок с
            буквой: место занято всегда, иначе строки без фото сдвигались
            влево и колонки переставали стоять друг под другом. */}
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={c.name}
            width={36}
            height={36}
            unoptimized
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
            {stats.lastVisit ? momentDay(stats.lastVisit) : "—"}
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
            {stats.referrerName && ` — ${stats.referrerName}`}
          </p>
          {stats.bonusLeft !== null && (
            <p>
              Бонусных минут за друзей:{" "}
              <span className="font-bold text-ink">{stats.bonusLeft}</span>
            </p>
          )}
          <p>
            В базе с {momentDay(c.created_at)}
            {c.age !== null && ` · ${c.age} лет`}
            {c.city && ` · ${c.city}`}
          </p>
          <p>
            Занятий: {stats.sessions} · потратил{" "}
            <span className="font-bold text-ink">{vnd(stats.spent)}</span>
            {stats.lastVisit && ` · был ${momentDay(stats.lastVisit)}`}
          </p>
        </div>

        <div className="mt-3">
          <ClientPhoto clientId={c.id} photoUrl={photoUrl} name={c.name} />
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

export async function ClientsScreen({
  searchParams,
  base,
}: {
  searchParams: Promise<{ q?: string; sort?: string; limit?: string }>;
  /** Кабинет, из которого открыт экран: «/admin» или «/smm». */
  base: string;
}) {
  const { q = "", sort = "", limit: limitParam } = await searchParams;
  const supabase = await createClient();

  // «Показать ещё» — та же страница с ?limit= больше на PAGE_SIZE. Через адрес,
  // а не состояние в браузере: поиск, сортировка и раскрытая порция
  // переживают обновление страницы и возврат «назад».
  const limit = Math.max(
    PAGE_SIZE,
    Math.floor(Number(limitParam) / PAGE_SIZE) * PAGE_SIZE || PAGE_SIZE,
  );

  const { all, sorted, visits } = await loadClientList(supabase, { q, sort });
  const found = sorted;

  const statsById = new Map<string, ClientStats>();
  const stat = (id: string): ClientStats => {
    let s = statsById.get(id);
    if (!s) {
      s = { ...visits(id), activeSubs: 0, member: false, referrerName: null, bonusLeft: null };
      statsById.set(id, s);
    }
    return s;
  };

  const shown = sorted.slice(0, limit);
  const ids = shown.map((c) => c.id);

  // Остальные агрегаты (бейджи) — только по показанным клиентам, пачками
  // (selectIn): после нескольких «Показать ещё» id сотни.
  const agentIds = shown
    .filter((c) => c.referrer_type === "agent" && c.referrer_id)
    .map((c) => c.referrer_id as string);
  const memberReferrerIds = shown
    .filter((c) => c.referrer_type === "member" && c.referrer_id)
    .map((c) => c.referrer_id as string);
  const photoPathByClient = new Map(
    shown.map((c) => [
      c.id,
      privatePhotoPath("clients", c.photo_path, c.photo_url),
    ]),
  );

  const [subs, members, agents, photoUrls, referrers, bonusEarned, bonusSpent] =
    await Promise.all([
      selectIn<{ client_id: string; status: string }>(ids, (chunk) =>
        supabase
          .from("subscriptions")
          .select("client_id, status")
          .in("client_id", chunk),
      ),
      selectIn<{ client_id: string }>(ids, (chunk) =>
        supabase.from("memberships").select("client_id").in("client_id", chunk),
      ),
      selectIn<{ id: string; ref_code: string; user: unknown }>(
        agentIds,
        (chunk) =>
          supabase
            .from("agents")
            .select("id, ref_code, user:users!user_id(name)")
            .in("id", chunk),
      ),
      createPrivatePhotoUrls("clients", [...photoPathByClient.values()]),
      // Рефералы (0063): кто пригласил, сколько минут начислено и потрачено.
      // Та же формула, что у функции базы bonus_minutes_left, только пачкой.
      selectIn<{ id: string; name: string | null }>(memberReferrerIds, (chunk) =>
        supabase.from("clients").select("id, name").in("id", chunk),
      ),
      selectIn<{ referrer_id: string; amount: number | null }>(ids, (chunk) =>
        supabase
          .from("referral_rewards")
          .select("referrer_id, amount")
          .eq("referrer_type", "member")
          .eq("reward_type", "minutes")
          .eq("status", "confirmed")
          .in("referrer_id", chunk),
      ),
      selectIn<{ client_id: string; minutes_used: number | null }>(
        ids,
        (chunk) =>
          supabase
            .from("sessions")
            .select("client_id, minutes_used, services!inner(code)")
            .eq("services.code", BONUS_SERVICE_CODE)
            .in("client_id", chunk),
      ),
    ]);
  for (const r of subs) {
    if (r.status === "active") stat(r.client_id as string).activeSubs += 1;
  }
  for (const r of members) {
    stat(r.client_id as string).member = true;
  }
  const agentById = new Map(
    agents.map((a) => [
      a.id as string,
      `${(a.user as unknown as { name: string } | null)?.name ?? "агент"} (${a.ref_code})`,
    ]),
  );
  const memberById = new Map(
    referrers.map((r) => [r.id as string, `${r.name ?? "клиент"} (клиент)`]),
  );
  for (const c of shown) {
    if (c.referrer_type === "agent" && c.referrer_id) {
      stat(c.id).referrerName = agentById.get(c.referrer_id) ?? null;
    } else if (c.referrer_type === "member" && c.referrer_id) {
      stat(c.id).referrerName = memberById.get(c.referrer_id) ?? null;
    }
  }
  for (const r of bonusEarned) {
    const st = stat(r.referrer_id as string);
    st.bonusLeft = (st.bonusLeft ?? 0) + Number(r.amount ?? 0);
  }
  for (const r of bonusSpent) {
    const st = stat(r.client_id as string);
    st.bonusLeft = (st.bonusLeft ?? 0) - Number(r.minutes_used ?? 0);
  }

  // Адрес с текущими поиском и сортировкой — для «Показать ещё» и выгрузки.
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (sort) params.set("sort", sort);
  const moreParams = new URLSearchParams(params);
  moreParams.set("limit", String(limit + PAGE_SIZE));
  const xlsxQs = params.toString();

  return (
    <div>
      <PageHeader
        title="Клиенты"
        hint="Все, кто занимался или покупал; поиск по имени и телефону"
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
              href={qs ? `${base}/clients?${qs}` : `${base}/clients`}
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">
          {found.length === all.length
            ? `Всего: ${all.length}`
            : `Найдено: ${found.length}`}
          {found.length > shown.length && ` · показаны ${shown.length}`}
        </p>
        {/* Выгрузка ВСЕХ найденных (не только показанных) — с теми же поиском
            и сортировкой, что на экране. */}
        {found.length > 0 && (
          <a
            href={`/api/admin/clients${xlsxQs ? `?${xlsxQs}` : ""}`}
            download
            className="rounded-full border border-primary px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            Скачать Excel
          </a>
        )}
      </div>

      {shown.length === 0 && (
        <p className="mt-4 text-sm text-muted">Никого не нашли.</p>
      )}
      {shown.length > 0 && <ClientsHead />}
      <div className="mt-3 space-y-3 xl:mt-1">
        {shown.map((c) => {
          const path = photoPathByClient.get(c.id);
          return (
            <ClientCard
              key={c.id}
              c={c}
              stats={stat(c.id)}
              photoUrl={path ? (photoUrls.get(path) ?? null) : null}
            />
          );
        })}
      </div>

      {found.length > shown.length && (
        <div className="mt-4 flex justify-center">
          {/* scroll={false}: новая порция дописывается снизу, а экран
              остаётся там, где человек дочитал. */}
          <Link
            href={`${base}/clients?${moreParams.toString()}`}
            scroll={false}
            className="rounded-full border border-line px-5 py-2 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
          >
            Показать ещё {Math.min(PAGE_SIZE, found.length - shown.length)}
          </Link>
        </div>
      )}
    </div>
  );
}
