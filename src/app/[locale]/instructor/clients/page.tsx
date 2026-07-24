import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAppUser } from "@/lib/auth";
import { phoneDigits } from "@/lib/phone";
import { vnd } from "@/lib/stats";
import { SaveForm } from "@/app/[locale]/admin/SaveForm";
import { ClientPhoto } from "@/app/[locale]/admin/clients/ClientPhoto";
import {
  updateClientFromInstructorAction,
  uploadClientPhotoFromInstructorAction,
} from "../actions";

// «Клиенты» в кабинете инструктора (пачка №9, пак 1) — та же база, что у
// админа: клиентов заводит сам инструктор в записи и списании, и опечатку в
// телефоне или имени чинить ему же, не через админа. Читаем обычным клиентом
// (RLS отдаёт инструктору всех клиентов — иначе не найти человека по телефону
// перед записью), пишем серверным экшеном под service_role.

interface ClientRow {
  id: string;
  name: string;
  phone: string | null;
  source: string;
  internal_note: string | null;
  age: number | null;
  city: string | null;
  tour_approved: boolean;
  telegram_username: string | null;
  photo_url: string | null;
  created_at: string;
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
}

function ClientCard({ c, stats }: { c: ClientRow; stats: ClientStats }) {
  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 [&::-webkit-details-marker]:hidden">
        {/* Миниатюра в свёрнутой строке: узнать человека в лицо, не раскрывая
            карточку. Имена в базе повторяются, лица — нет. */}
        {c.photo_url ? (
          <Image
            src={c.photo_url}
            alt={c.name}
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{c.name}</p>
          <p className="truncate text-xs text-muted">
            {[
              c.phone,
              `${stats.sessions} занятий`,
              stats.spent > 0 ? vnd(stats.spent) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
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
        <span className="text-muted transition-transform group-open:rotate-180">▾</span>
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
          <p>Источник: {SOURCE_LABEL[c.source] ?? c.source}</p>
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

        {/* capture: инструктор стоит рядом с клиентом — телефон открывает
            камеру сразу, а не галерею. */}
        <div className="mt-3">
          <ClientPhoto
            clientId={c.id}
            photoUrl={c.photo_url}
            name={c.name}
            action={uploadClientPhotoFromInstructorAction}
            capture
          />
        </div>

        <SaveForm action={updateClientFromInstructorAction} className="mt-3">
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

export default async function InstructorClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const { q = "", sort = "" } = await searchParams;
  const supabase = await createClient();

  // Сессии тянем по ВСЕМ клиентам сразу (не по показанным): сортировка по
  // занятиям/тратам/визиту должна ранжировать весь список, а не первые 50.
  // «Занятий / потратил» здесь — про занятия С ЭТИМ инструктором, а не по
  // школе: чужие чеки ему видеть незачем, а свою историю с клиентом он и ищет.
  // .eq("instructor_id") обязателен — RLS отдаёт ему ещё и чужие списания
  // минут (они нужны для остатка абонемента), и без фильтра они попали бы
  // в счётчик занятий.
  const [{ data }, mySessionsRes] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, name, phone, source, internal_note, age, city, tour_approved, telegram_username, photo_url, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("sessions")
      .select("client_id, amount, date")
      .eq("instructor_id", user.id)
      .limit(10000),
  ]);
  const all = (data ?? []) as ClientRow[];

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
      s = { sessions: 0, spent: 0, lastVisit: null, activeSubs: 0 };
      statsById.set(id, s);
    }
    return s;
  };
  for (const r of mySessionsRes.data ?? []) {
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

  // Бейдж «Абонемент» — батчем только по показанным клиентам.
  const { data: subsRows } = ids.length
    ? await supabase
        .from("subscriptions")
        .select("client_id, status")
        .in("client_id", ids)
    : { data: [] };
  for (const r of subsRows ?? []) {
    if (r.status === "active") stat(r.client_id as string).activeSubs += 1;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Клиенты</h1>
      <p className="mt-1 text-sm text-muted">
        Вся база школы — ищите по имени или телефону. «Занятий» и «потратил» —
        по вашим записям.
      </p>

      <form className="mt-4 flex gap-2">
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
          className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
        >
          Найти
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SORTS.map((s) => {
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          if (s.key) params.set("sort", s.key);
          const qs = params.toString();
          return (
            <Link
              key={s.key}
              href={qs ? `/instructor/clients?${qs}` : "/instructor/clients"}
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

      <p className="mt-4 text-sm text-muted">
        {found.length === all.length
          ? `Всего: ${all.length}`
          : `Найдено: ${found.length}`}
        {found.length > PAGE_SIZE && ` · показаны первые ${PAGE_SIZE}`}
      </p>

      {shown.length === 0 && (
        <p className="mt-4 text-sm text-muted">Никого не нашли.</p>
      )}
      <div className="mt-3 space-y-3">
        {shown.map((c) => (
          <ClientCard key={c.id} c={c} stats={stat(c.id)} />
        ))}
      </div>
    </div>
  );
}
