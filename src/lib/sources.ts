import type { createClient } from "@/lib/supabase/server";
import type { StatsRange } from "@/lib/stats";
import { channelLabel, LEGACY_CHANNELS } from "@/lib/channels";

// «Источники» — откуда к нам приходят люди и что из этого выходит (10.08.2026,
// просьба СММщика: он ставит ссылки в шапку Instagram и в описания роликов на
// YouTube и хочет видеть отдачу).
//
// Одна строка = один источник. Слева направо она читается как воронка:
//   переходов → заявок → из них состоялось → выручка.
//
// Источники в школе трёх пород, и мешать их в одну кучу нельзя:
//  • МЕТКА — рекламная ссылка ?src=instagram (список ведёт админ в «Материалах»).
//    Только у неё бывают переходы: их считает api/ref-visits.
//  • РЕФ-ССЫЛКА агента или инструктора /r/<код>. Переходы тоже считаются, но
//    смысл другой: это конкретный человек привёл гостя.
//  • РУЧНОЙ КАНАЛ — «Пляжи», «Звонок», «WhatsApp» и прочее, что инструктор
//    ставит руками в форме записи (справочник booking_channels, 0041).
//    Переходов там не бывает никогда: человек подошёл ногами, а не кликнул.
//
// Один и тот же канал может быть в обоих списках — Instagram и висит ссылкой в
// «Материалах», и выбирается руками, когда гость написал в директ. Такие
// сводим в ОДНУ строку, метка главнее: у неё есть переходы, а у ручного
// выбора их не бывает, и разведя их по двум строкам мы бы делили одну воронку
// пополам.
//
// Что здесь НЕ считается, чтобы цифры не выглядели умнее, чем есть:
//  • Выручка привязана к заявке: берём клиентов, чьи заявки пришли в этом
//    периоде, и складываем их занятия за тот же период. Клиент, который
//    записался в июле, а катался в августе, в августовскую строку не попадёт.
//  • Переход и заявка не связаны между собой в одну цепочку: браузер гостя мы
//    не метим. Конверсия — это отношение двух чисел за период, а не путь
//    конкретного человека.
//  • Метка живёт в браузере 30 дней, но Safari на iPhone чистит хранилище
//    раньше. Часть заявок поэтому приходит без метки — они в строке «прямые».

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type SourceKind = "tag" | "ref" | "manual" | "direct";

export interface SourceRow {
  key: string;
  label: string;
  kind: SourceKind;
  hits: number; // переходы по ссылке
  bookings: number; // заявок пришло
  done: number; // заявки, доведённые до занятия
  cancelled: number;
  clients: number; // сколько разных клиентов за этими заявками
  revenue: number; // их занятия за период
}

export interface SourcesReport {
  rows: SourceRow[]; // по убыванию: сначала те, где что-то происходило
  totals: {
    hits: number;
    bookings: number;
    done: number;
    revenue: number;
  };
  /** Переходы есть, а «Материалов» с такой меткой нет — метку кто-то придумал на ходу. */
  unknownTags: string[];
}

const DIRECT_KEY = "__direct__";

// Метку в заявку кладут двумя разными путями: ссылка приносит её как есть
// (?src=instagram), а инструктор может вписать канал руками пунктом «Другой…»
// — и пишет «Instagram» с большой буквы. Без приведения к одному виду в
// таблице появлялись две строки «Instagram» с разными цифрами, и обе неверные.
function normKey(raw: string): string {
  return raw.trim().toLowerCase();
}

// Красивое имя источника. Метки берём из «Материалов» (их админ и заводит),
// ручные каналы — из справочника, реф-коды подписываем именем владельца.
function labelFor(
  key: string,
  kind: SourceKind,
  materials: Map<string, string>,
  channels: Map<string, string>,
  refOwners: Map<string, string>,
): string {
  if (kind === "direct") return "Прямые заходы";
  if (kind === "ref") return refOwners.get(key) ?? `Реф-ссылка ${key}`;
  // Ключ приведён к нижнему регистру (normKey), а показать надо как в
  // справочнике: «Пляжи», а не «пляжи».
  if (kind === "manual") return channels.get(key) ?? channelLabel(key) ?? key;
  return materials.get(key) ?? key;
}

// Переходы за период. Колонка src приехала в 0037: пока миграция не накатана,
// читаем без неё — тогда в таблице просто не будет переходов по рекламным
// меткам, а весь остальной экран продолжит работать (та же страховка, что у
// премии за смену в lib/salary).
async function loadVisits(
  supabase: Supabase,
  range: StatsRange,
): Promise<{ code: string | null; src: string | null }[]> {
  const query = (columns: string) =>
    supabase
      .from("ref_visits")
      .select(columns)
      .gte("created_at", range.fromIso)
      .lt("created_at", range.toIso)
      .limit(50000);

  const { data, error } = await query("code, src");
  if (!error) return (data ?? []) as unknown as { code: string | null; src: string | null }[];

  const { data: plain } = await query("code");
  return ((plain ?? []) as unknown as { code: string | null }[]).map((v) => ({
    code: v.code,
    src: null,
  }));
}

export async function getSourcesReport(
  supabase: Supabase,
  range: StatsRange,
): Promise<SourcesReport> {
  const [visits, bookingsRes, materialsRes, channelsRes, agentsRes, instructorsRes] =
    await Promise.all([
      loadVisits(supabase, range),
      supabase
        .from("bookings")
        .select("status, src, ref_code, client_id")
        .gte("created_at", range.fromIso)
        .lt("created_at", range.toIso)
        .limit(5000),
      supabase.from("materials").select("src, label"),
      // Справочник каналов (0041). Пока миграция не накатана, запрос вернёт
      // ошибку — тогда остаются старые ключи из LEGACY_CHANNELS, и экран
      // продолжает работать (та же страховка, что у переходов выше).
      supabase.from("booking_channels").select("name"),
      supabase.from("agents").select("ref_code, user:users!user_id(name)"),
      supabase
        .from("users")
        .select("name, ref_code")
        .eq("role", "instructor")
        .not("ref_code", "is", null),
    ]);

  const materials = new Map(
    ((materialsRes.data ?? []) as { src: string; label: string }[]).map((m) => [
      normKey(m.src),
      m.label,
    ]),
  );

  // Ручные каналы: нижний регистр → как показывать. Старые ключи (beach) тоже
  // тут — заявки до 0041 их ещё помнят, если миграцию накатили не сразу.
  const channels = new Map<string, string>();
  for (const [key, name] of Object.entries(LEGACY_CHANNELS)) {
    channels.set(key, name);
    channels.set(normKey(name), name);
  }
  for (const c of (channelsRes.data ?? []) as { name: string }[]) {
    channels.set(normKey(c.name), c.name);
  }

  const refOwners = new Map<string, string>();
  for (const a of (agentsRes.data ?? []) as unknown as {
    ref_code: string;
    user: { name: string } | null;
  }[]) {
    if (a.ref_code) refOwners.set(a.ref_code, `Агент ${a.user?.name ?? "—"}`);
  }
  for (const u of (instructorsRes.data ?? []) as {
    name: string;
    ref_code: string | null;
  }[]) {
    if (u.ref_code) refOwners.set(u.ref_code, `Инструктор ${u.name}`);
  }

  // Заготовка строки. Ключ у метки и у реф-кода может совпасть только по злому
  // умыслу, но разводим их по типу — подписи и смысл у них разные.
  const rows = new Map<string, SourceRow>();
  const row = (key: string, kind: SourceKind): SourceRow => {
    const id = `${kind}:${key}`;
    let entry = rows.get(id);
    if (!entry) {
      entry = {
        key,
        label: labelFor(key, kind, materials, channels, refOwners),
        kind,
        hits: 0,
        bookings: 0,
        done: 0,
        cancelled: 0,
        clients: 0,
        revenue: 0,
      };
      rows.set(id, entry);
    }
    return entry;
  };

  // 1. Переходы
  const unknown = new Set<string>();
  for (const v of visits) {
    if (v.code) {
      row(v.code, "ref").hits += 1;
    } else if (v.src) {
      const key = normKey(v.src);
      row(key, "tag").hits += 1;
      if (!materials.has(key)) unknown.add(key);
    }
  }

  // 2. Заявки. Реф-код перебивает метку: если человек пришёл по личной ссылке,
  // источник — этот человек, а не канал, в котором ссылку опубликовали.
  const clientsBySource = new Map<string, Set<string>>();
  const sourceByClient = new Map<string, string>();
  for (const b of (bookingsRes.data ?? []) as {
    status: string;
    src: string | null;
    ref_code: string | null;
    client_id: string | null;
  }[]) {
    // Метка «Материалов» главнее справочника: канал, заведённый и там и там
    // (Instagram), должен лечь в одну строку с переходами по своей ссылке.
    // Незнакомая метка (?src=gads из рекламы) — тоже метка, а не ручной канал:
    // переходы по ней считаются, и разводить их с заявками нельзя.
    const srcKey = b.src ? normKey(b.src) : null;
    const kind: SourceKind = b.ref_code
      ? "ref"
      : srcKey
        ? materials.has(srcKey)
          ? "tag"
          : channels.has(srcKey)
            ? "manual"
            : "tag"
        : "direct";
    const key = b.ref_code ?? srcKey ?? DIRECT_KEY;
    const entry = row(key, kind);
    entry.bookings += 1;
    if (b.status === "done") entry.done += 1;
    if (b.status === "cancelled") entry.cancelled += 1;

    if (b.client_id) {
      const id = `${kind}:${key}`;
      const set = clientsBySource.get(id) ?? new Set<string>();
      set.add(b.client_id);
      clientsBySource.set(id, set);
      // Клиент мог оставить две заявки с разных ссылок: деньги отдаём последней
      // (last-touch — тем же правилом живёт вся атрибуция, см. lib/attribution).
      sourceByClient.set(b.client_id, id);
    }
  }

  for (const [id, set] of clientsBySource) {
    const entry = rows.get(id);
    if (entry) entry.clients = set.size;
  }

  // 3. Деньги: занятия этих клиентов за тот же период.
  const clientIds = [...sourceByClient.keys()];
  if (clientIds.length > 0) {
    const { data } = await supabase
      .from("sessions")
      .select("client_id, amount")
      .in("client_id", clientIds)
      .gte("date", range.fromDay)
      .lt("date", range.toDay);

    for (const s of (data ?? []) as { client_id: string | null; amount: number | null }[]) {
      if (!s.client_id) continue;
      const id = sourceByClient.get(s.client_id);
      const entry = id ? rows.get(id) : undefined;
      if (entry) entry.revenue += Number(s.amount ?? 0);
    }
  }

  // 4. Метки без единого события за период — показываем нулями: пустая строка
  // «Instagram 0 переходов» это тоже ответ, причём важный.
  for (const [src, label] of materials) {
    const id = `tag:${src}`;
    if (!rows.has(id)) {
      rows.set(id, {
        key: src,
        label,
        kind: "tag",
        hits: 0,
        bookings: 0,
        done: 0,
        cancelled: 0,
        clients: 0,
        revenue: 0,
      });
    }
  }

  const list = [...rows.values()].sort((a, b) => {
    const w = (r: SourceRow) => r.revenue * 1e6 + r.bookings * 1e3 + r.hits;
    return w(b) - w(a);
  });

  return {
    rows: list,
    totals: {
      hits: list.reduce((s, r) => s + r.hits, 0),
      bookings: list.reduce((s, r) => s + r.bookings, 0),
      done: list.reduce((s, r) => s + r.done, 0),
      revenue: list.reduce((s, r) => s + r.revenue, 0),
    },
    unknownTags: [...unknown],
  };
}
