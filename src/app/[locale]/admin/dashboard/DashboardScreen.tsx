// Экран «Статистика» — общий для админа и СММщика (кабинет /smm). Разница одна
// и она в пропсе showProfit: СММщик видит выручку, воронку и визиты, но не
// чистую прибыль, ЗП инструкторов и доли учредителей.
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
import { channelLabel } from "@/lib/channels";
import {
  NONE,
  channelKey,
  filterVisits,
  isPaymentMissing,
  loadVisits,
  paymentKey,
  serviceLabel,
  sortVisits,
} from "@/lib/visits";
import { buildPaymentBreakdown, SUBS_CAT, type PaymentInput } from "@/lib/payments";
import { getFinance } from "@/lib/finance";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PeriodBar } from "@/components/cabinet/PeriodBar";
import { VisitsTable, type VisitCell, type VisitColumn } from "./VisitsTable";

// Статистика (бывший дашборд): «как дела у школы» за любой период. Read-only.
// Сверху таблица визитов (строка = одно занятие) с сортировкой по колонкам
// и фильтрами по услуге/инструктору; фильтры действуют и на графики ниже.
// Правило денег: доход существует только после факта оплаты — неоплаченные
// абонементы в итоги не входят, показываются справочной строкой.
//
// Пачка №23: способ оплаты виден и в строке таблицы, и отдельным блоком
// «Деньги по способам оплаты» (наличные / QR / T-Bank × виды занятий) — по
// нему сводят кассу. Плюс «Куда ушли деньги»: то же, что на вкладке
// «Расходы», но за выбранный период — начальник видит чистую прибыль, не
// уходя со «Статистики».

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

const presetClass = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
    active
      ? "bg-primary text-white"
      : "border border-line text-muted hover:border-primary hover:text-primary"
  }`;

// Колонки таблицы: ключ ?sort=, подпись, стартовое направление.
const COLUMNS = [
  { key: "date", label: "Дата", startDir: "d" },
  { key: "client", label: "Клиент", startDir: "a" },
  { key: "service", label: "Занятие", startDir: "a" },
  { key: "amount", label: "Оплата", startDir: "d" },
  { key: "payment", label: "Чем оплатил", startDir: "a" },
  { key: "channel", label: "Откуда", startDir: "a" },
  { key: "instructor", label: "Откатал", startDir: "a" },
  { key: "creator", label: "Записал", startDir: "a" },
  // Подпись короткая (не «Визитов всего»): с появлением колонки «Откуда» ряд
  // перестал влезать в колонку контента даже на широком экране.
  { key: "visits", label: "Визитов", startDir: "d" },
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

// Параметры экрана: период, фильтры и сортировка таблицы визитов. Вынесены
// в тип, потому что их принимают обе страницы-обёртки — админская и СММ.
export interface DashboardParams {
  from?: string;
  to?: string;
  cat?: string;
  inst?: string;
  pay?: string;
  ch?: string;
  sort?: string;
  dir?: string;
}

export async function DashboardScreen({
  searchParams,
  base,
  showProfit,
}: {
  searchParams: Promise<DashboardParams>;
  /** Кабинет, из которого открыт экран: «/admin» или «/smm». */
  base: string;
  /** Показывать ли блок «Чистая прибыль»: сколько школа заработала после
      Marina, ЗП инструкторов, комиссий и долей. У СММщика его нет — он ведёт
      рекламу, а не расчёты с людьми, и чужие зарплаты его не касаются. */
  showProfit: boolean;
}) {
  const {
    from,
    to,
    cat = "",
    inst = "",
    pay = "",
    ch = "",
    sort = "date",
    dir = "d",
  } = await searchParams;
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
    const current: Record<string, string> = {
      from: from ?? "",
      to: to ?? "",
      cat,
      inst,
      pay,
      ch,
      sort,
      dir,
    };
    for (const [k, v] of Object.entries({ ...current, ...overrides })) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `${base}/dashboard?${qs}` : `${base}/dashboard`;
  };
  // Тот же набор параметров, но для выгрузки: файл должен повторять то, что
  // сейчас на экране, вместе с фильтрами и сортировкой.
  const csvHref = href({}).replace(`${base}/dashboard`, "/api/admin/visits");

  const supabase = await createClient();
  const [
    // rows — строки таблицы (занятия + продажи абонементов), sessions — только
    // занятия: на них по-прежнему считаются графики и средний чек.
    { rows, sessions, visitsOf },
    unpaidSubsRes,
    clientsRes,
    bookingsRes,
    fin,
  ] = await Promise.all([
    // Строки таблицы + счётчик визитов клиента за всю историю (lib/visits —
    // тот же расчёт использует выгрузка CSV).
    loadVisits(supabase, range),
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
    // Финмодель периода — та же, что на вкладке «Расходы» (lib/finance).
    // Без блока прибыли её не считаем вовсе: лишний поход в базу, а у СММщика
    // ещё и нет доступа к расходам школы (0040).
    showProfit ? getFinance(supabase, range) : Promise.resolve(null),
  ]);

  // Оплаченные в периоде абонементы приходят теми же строками, что и занятия
  // (lib/visits) — отдельного запроса к subscriptions больше не нужно.
  const paidSubs = rows.filter((r) => r.sale);
  const paidSubsSum = paidSubs.reduce((s, r) => s + r.amount, 0);
  const unpaid = (unpaidSubsRes.data ?? []).filter((r) => r.status !== "cancelled");
  const unpaidSum = unpaid.reduce((s, r) => s + (r.price ?? 0), 0);

  // Фильтры-чипсы собираем из строк периода: только то, что реально было.
  // Берём rows, а не sessions, — иначе к появившимся строкам продаж не было бы
  // ни чипса «Абонементы», ни продавца в списке инструкторов.
  const presentCats = [...new Set(rows.map((r) => r.service?.category ?? ""))]
    .filter(Boolean)
    .sort();
  const presentInstructors = new Map<string, string>();
  for (const r of rows) {
    if (r.instructor_id) {
      presentInstructors.set(r.instructor_id, r.instructor?.name ?? "—");
    }
  }
  // Способы оплаты и каналы записи — тоже чипсами. Отдельный чип «без способа
  // оплаты» показываем, только если такие занятия есть: по ним не сходится
  // касса, и это ровно тот список, который надо дозаполнить.
  const presentPayments = [
    ...new Set(rows.filter((r) => r.amount > 0).map((r) => r.payment?.name ?? "")),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ru"));
  const missingPayments = rows.filter(isPaymentMissing).length;
  // Канал записи бывает только у занятия: продажи абонементов в этот список не
  // берём, иначе они раздули бы счётчик «без канала» (см. filterVisits).
  const presentChannels = [...new Set(sessions.map(channelKey))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ru"));
  const missingChannels = sessions.filter((r) => channelKey(r) === "").length;

  const filtered = filterVisits(rows, { cat, inst, pay, ch });
  const sorted = sortVisits(filtered, sort, dir, visitsOf);
  // Занятия и продажи из того, что осталось после фильтров: итоги и графики
  // считаются по разным подмножествам (продажа абонемента — не визит).
  const filteredSessions = filtered.filter((r) => !r.sale);
  const filteredSales = filtered.filter((r) => r.sale);

  // Готовые строки и шапка для клиентской таблицы: она умеет только рисовать
  // и сворачивать, форматирование и сортировка остаются здесь, на сервере.
  const tableRows: VisitCell[] = sorted.map((r) => ({
    id: r.id,
    date: fmtDay(r.date),
    client: r.client?.name ?? "—",
    // Ссылка на карточку клиента — это список клиентов, отфильтрованный по
    // имени: отдельной страницы клиента в админке нет, а «увидел странный чек →
    // посмотрел, кто это» иначе превращается в ручной поиск во вкладке рядом.
    clientHref: r.client?.name
      ? `${base}/clients?q=${encodeURIComponent(r.client.name)}`
      : null,
    service: serviceLabel(r),
    amount: r.amount > 0 ? vnd(r.amount) : null,
    payment: paymentKey(r) || null, // пусто → «не указан», подсвечиваем
    paymentMissing: isPaymentMissing(r),
    channel: channelKey(r) || null,
    instructor: r.instructor?.name ?? "—",
    creator: r.creator?.name ?? "—",
    visits: String(visitsOf(r) || "—"),
    sale: r.sale === true,
  }));
  const tableColumns: VisitColumn[] = COLUMNS.map((c) => {
    const active = sort === c.key;
    // Клик по активной колонке разворачивает направление.
    const nextDir = active ? (dir === "a" ? "d" : "a") : c.startDir;
    return {
      key: c.key,
      label: c.label,
      href: href({ sort: c.key, dir: nextDir }),
      active,
      arrow: active ? (dir === "a" ? " ↑" : " ↓") : "",
    };
  });

  // Итоги под таблицей — по всем отфильтрованным строкам, не только показанным.
  // Выручка считает и абонементы (это те же деньги в кассе), а «Визитов» и
  // «Средний чек» — только занятия: продажа абонемента визитом не была, и,
  // попав в средний чек, она раздула бы его вдвое.
  const tSum = filtered.reduce((s, r) => s + r.amount, 0);
  const tClients = new Set(filtered.map((r) => r.client_id).filter(Boolean)).size;
  const tVisits = filteredSessions.length;
  const tPaid = filteredSessions.filter((r) => r.amount > 0);
  const tAvg = tPaid.length
    ? Math.round(tPaid.reduce((s, r) => s + r.amount, 0) / tPaid.length)
    : 0;
  const tSalesSum = filteredSales.reduce((s, r) => s + r.amount, 0);
  const tMinutes = filtered.reduce(
    (s, r) => s + (r.subscription_id ? (r.minutes_used ?? 0) : 0),
    0,
  );

  // Деньги по способам оплаты — по всему периоду, БЕЗ фильтров услуги и
  // инструктора: это касса, её сводят целиком. Абонементы сюда входят по дате
  // оплаты, списания минут — нет (в этот день денег не было).
  const payments = buildPaymentBreakdown([
    ...sessions.map<PaymentInput>((r) => ({
      amount: r.amount,
      method: r.payment?.name ?? null,
      category: r.service?.category ?? null,
    })),
    ...paidSubs.map<PaymentInput>((s) => ({
      amount: s.amount,
      method: s.payment?.name ?? null,
      category: SUBS_CAT,
    })),
  ]);
  // Колонки — в привычном порядке видов занятий, и только те, что встретились.
  const payCats = [
    ...Object.keys(CATEGORY_LABEL).filter((c) => payments.totalByCategory.has(c)),
    ...payments.categories.filter((c) => !(c in CATEGORY_LABEL)),
  ];

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
    // Ручные каналы (пляжи/звонок/мессенджер) показываем по-человечески,
    // вписанный руками канал и сайтовые метки (instagram/qr/flyer) — как есть:
    // с тех пор как канал можно вписать своими словами, отличить одно от
    // другого нечем, а «src: instagram» и так читалось как техническая строка.
    const source = b.ref_code
      ? "по реф-ссылке"
      : b.src
        ? (channelLabel(b.src) ?? "прямые")
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
  for (const r of filteredSessions) {
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
  // Оплаченные абонементы — отдельная строка категорий. Берём их из строк
  // таблицы: там продажа уже прошла те же фильтры (по продавцу — тоже), и
  // отдельная оговорка «только без фильтров» больше не нужна.
  const salesSum = filteredSales.reduce((s, r) => s + r.amount, 0);
  if (salesSum > 0) {
    byCategory.set("subscription", (byCategory.get("subscription") ?? 0) + salesSum);
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
      <PageHeader title="Статистика" hint={label} />

      {/* Период: готовые отрезки слева, свои даты справа — одной строкой
          (PeriodBar). Раньше это занимало три яруса, и цифры начинались
          на треть экрана ниже. */}
      <PeriodBar
        presets={[
          { label: "Этот месяц", href: href({ from: "", to: "" }), active: !custom },
          {
            label: "Прошлый месяц",
            href: href({ from: prev.fromDay, to: prev.lastDay }),
            active: custom && from === prev.fromDay && to === prev.lastDay,
          },
          {
            label: "7 дней",
            href: href({ from: vnShiftDays(today, -6), to: today }),
            active: custom && from === vnShiftDays(today, -6) && to === today,
          },
          {
            label: "30 дней",
            href: href({ from: vnShiftDays(today, -29), to: today }),
            active: custom && from === vnShiftDays(today, -29) && to === today,
          },
          {
            label: "Всё время",
            href: href({ from: ALL_FROM, to: today }),
            active: custom && from === ALL_FROM,
          },
        ]}
        fromDay={range.fromDay}
        toDay={lastDay}
        today={today}
        hidden={{ ...(cat ? { cat } : {}), ...(inst ? { inst } : {}) }}
      />

      {/* Деньги периода — сразу под выбором периода (10.08.2026). Раньше
          выручка и чистая прибыль лежали в самом низу, под таблицей визитов
          на сотню строк: чтобы увидеть главную цифру месяца, приходилось
          прокручивать мимо всего остального. Фильтры стоят ниже, вплотную к
          таблице, на которую они и действуют. */}
      <div className={`mt-4 grid gap-3 ${showProfit ? "lg:grid-cols-2" : ""}`}>
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

        {/* Куда ушли деньги — тот же расчёт, что на вкладке «Расходы»
            (lib/finance), но за выбранный здесь период: начальник видит
            чистую прибыль, не уходя со «Статистики». */}
        {showProfit && fin && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs text-muted">Чистая прибыль за период</p>
          <p className="mt-1 text-3xl font-bold text-primary">{vnd(fin.netProfit)}</p>
          <div className="mt-3 space-y-1 text-sm text-muted">
            <p className="flex items-baseline justify-between gap-2">
              <span>Marina Beach · 35%</span>
              <span className="font-semibold text-ink">−{vnd(fin.marina)}</span>
            </p>
            <p className="flex items-baseline justify-between gap-2">
              <span>ЗП инструкторов</span>
              <span className="font-semibold text-ink">−{vnd(fin.instructorPay)}</span>
            </p>
            {fin.agentCommissions > 0 && (
              <p className="flex items-baseline justify-between gap-2">
                <span>Комиссии агентов</span>
                <span className="font-semibold text-ink">
                  −{vnd(fin.agentCommissions)}
                </span>
              </p>
            )}
            <p className="flex items-baseline justify-between gap-2">
              <span>Дэвид + Ромчик · 2%</span>
              <span className="font-semibold text-ink">−{vnd(fin.crmCut)}</span>
            </p>
            <p className="flex items-baseline justify-between gap-2">
              <span>Прочие расходы ({fin.manualExpenses.length})</span>
              <span className="font-semibold text-ink">−{vnd(fin.manualTotal)}</span>
            </p>
          </div>
          <p className="mt-3 border-t border-line/70 pt-2 text-xs text-muted">
            Выручка {vnd(fin.revenue)} − расходы {vnd(fin.autoTotal + fin.manualTotal)}.
            ЗП инструкторов — 15% с их занятий + {fin.instructorShifts} зачтённых
            выходов + 15% с проданных ими абонементов. Расписать траты и внести
            новые —{" "}
            <Link href={`${base}/expenses`} className="font-semibold text-primary">
              вкладка «Расходы»
            </Link>{" "}
            (она считает по месяцам).
          </p>
        </div>
        )}
      </div>

      {/* Фильтры: действуют на таблицу и графики занятий.
          Свёрнуты по умолчанию (10.08.2026): четыре ряда чипсов — услуги,
          инструкторы, способы оплаты, каналы — занимали пол-экрана перед
          таблицей, а нужны они изредка. Если фильтр уже выбран, блок открыт
          сам: иначе непонятно, почему в таблице половина строк. */}
      {sessions.length > 0 && (
        <details open={Boolean(cat || inst || pay || ch)} className="mt-4 space-y-1.5">
          <summary className="mb-1.5 inline-flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-muted transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
            Фильтры
            {[cat, inst, pay, ch].filter(Boolean).length > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">
                {[cat, inst, pay, ch].filter(Boolean).length}
              </span>
            )}
            <span aria-hidden>▾</span>
          </summary>
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
          {/* Способ оплаты: сводить кассу по одному способу и, главное, за один
              клик собрать занятия без способа — их потом дозаполняют в
              «Сессиях». */}
          {(presentPayments.length > 1 || missingPayments > 0) && (
            <div className="flex flex-wrap gap-1.5">
              <Link href={href({ ...catBase, pay: "" })} className={presetClass(!pay)}>
                Любая оплата
              </Link>
              {presentPayments.map((name) => (
                <Link
                  key={name}
                  href={href({ ...catBase, pay: name })}
                  className={presetClass(pay === name)}
                >
                  {name}
                </Link>
              ))}
              {missingPayments > 0 && (
                <Link
                  href={href({ ...catBase, pay: NONE })}
                  className={
                    pay === NONE
                      ? "rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white"
                      : "rounded-full border border-amber-500/60 px-3 py-1.5 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-500/10"
                  }
                >
                  Без способа оплаты · {missingPayments}
                </Link>
              )}
            </div>
          )}
          {/* Канал записи: откуда пришёл гость на конкретное занятие. По
              заявкам это видно давно, а по реальным занятиям — только теперь. */}
          {presentChannels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <Link href={href({ ...catBase, ch: "" })} className={presetClass(!ch)}>
                Все каналы
              </Link>
              {presentChannels.map((name) => (
                <Link
                  key={name}
                  href={href({ ...catBase, ch: name })}
                  className={presetClass(ch === name)}
                >
                  {name}
                </Link>
              ))}
              {missingChannels > 0 && (
                <Link
                  href={href({ ...catBase, ch: NONE })}
                  className={presetClass(ch === NONE)}
                >
                  Канал не указан · {missingChannels}
                </Link>
              )}
            </div>
          )}
        </details>
      )}

      {/* Строка = занятие либо продажа абонемента (по дню оплаты) */}
      <section className="mt-4 rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-2 p-4 pb-0">
          <h2 className="font-bold">Визиты за период</h2>
          <div className="flex items-baseline gap-3">
            <p className="text-xs text-muted">всего: {filtered.length}</p>
            {/* Выгрузка ровно того, что на экране: тот же период, те же
                фильтры и та же сортировка (см. csvHref). */}
            {filtered.length > 0 && (
              <>
                {/* Excel — первой кнопкой: CSV русский Excel сваливает в один
                    столбец (разделителем он считает запятую). CSV оставлен для
                    других программ и таблиц Google. */}
                <a
                  href={csvHref + (csvHref.includes("?") ? "&" : "?") + "format=xlsx"}
                  download
                  className="rounded-full border border-primary px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                >
                  Скачать Excel
                </a>
                <a
                  href={csvHref}
                  download
                  className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
                >
                  CSV
                </a>
              </>
            )}
          </div>
        </div>
        {/* Три вида строк легко перепутать, поэтому подписываем прямо здесь. */}
        <p className="px-4 pt-1 text-xs text-muted">
          Занятия — по дате занятия, проданные абонементы — по дню оплаты
          («продажа»). Прокат по абонементу — строка со списанными минутами и
          без суммы: деньги за него взяли раньше.
        </p>

        {filtered.length === 0 ? (
          <p className="p-4 pt-2 text-sm text-muted">
            {rows.length === 0
              ? "За этот период занятий и продаж не было."
              : "Под выбранные фильтры не попало ни одной строки — сбросьте лишние чипсы выше."}
          </p>
        ) : (
          <VisitsTable columns={tableColumns} rows={tableRows} />
        )}

        {filtered.length > 0 && (
          <div
            className={`grid grid-cols-2 gap-3 border-t border-line/70 p-4 ${
              // Колонок ровно столько, сколько плашек реально рисуем.
              ["", "", "sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4", "sm:grid-cols-5", "sm:grid-cols-6"][
                2 + (tSalesSum > 0 ? 1 : 0) + (tVisits > 0 ? 3 : 0)
              ]
            }`}
          >
            <Total label="Выручка" value={vnd(tSum)} />
            {/* Из чего сложилась выручка: иначе непонятно, почему она больше
                суммы чеков за занятия. */}
            {tSalesSum > 0 && (
              <Total label="в т.ч. абонементы" value={vnd(tSalesSum)} />
            )}
            <Total label="Клиентов" value={String(tClients)} />
            {/* Занятийные итоги прячем, если под фильтром остались одни продажи
                абонементов: «Визитов 0» при двух строках на экране читается как
                поломка, хотя продажа визитом и не была. */}
            {tVisits > 0 && (
              <>
                <Total label="Визитов" value={String(tVisits)} />
                <Total label="Средний чек" value={vnd(tAvg)} />
                <Total label="Списано минут" value={`${tMinutes} мин`} />
              </>
            )}
          </div>
        )}
      </section>

      {/* Деньги по способам оплаты: строка = способ, колонка = вид занятия.
          По этой таблице сводят кассу — наличку с карманом, безнал с выпиской. */}
      {payments.lines.length > 0 && (
        <section className="mt-3 rounded-2xl border border-line bg-surface">
          <div className="p-4 pb-0">
            <h2 className="font-bold">Деньги по способам оплаты</h2>
            <p className="mt-1 text-xs text-muted">
              За весь период целиком — фильтры услуги и инструктора на эту
              таблицу не действуют. Абонементы считаются по дате оплаты, списания
              минут с абонемента сюда не входят: денег в этот день не было.
            </p>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-line/70 text-left text-xs text-muted">
                  <th className="px-3 py-2 font-semibold">Способ оплаты</th>
                  {payCats.map((c) => (
                    <th key={c} className="px-3 py-2 text-right font-semibold">
                      {CATEGORY_LABEL[c] ?? c}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold">Итого</th>
                  <th className="px-3 py-2 text-right font-semibold">Оплат</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {payments.lines.map((l) => (
                  <tr key={l.method} className="border-b border-line/40">
                    <td
                      className={`px-3 py-2 font-semibold ${l.unknown ? "text-amber-600" : ""}`}
                    >
                      {l.method}
                    </td>
                    {payCats.map((c) => {
                      const v = l.byCategory.get(c) ?? 0;
                      return (
                        <td key={c} className="px-3 py-2 text-right">
                          {v > 0 ? vnd(v) : <span className="text-muted">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-bold">{vnd(l.amount)}</td>
                    <td className="px-3 py-2 text-right text-muted">{l.count}</td>
                  </tr>
                ))}
                <tr className="border-t border-line/70 font-bold">
                  <td className="px-3 py-2">Итого</td>
                  {payCats.map((c) => (
                    <td key={c} className="px-3 py-2 text-right">
                      {vnd(payments.totalByCategory.get(c) ?? 0)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right text-primary">
                    {vnd(payments.total)}
                  </td>
                  <td className="px-3 py-2 text-right text-muted">{payments.count}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="p-4 pt-3 text-xs text-muted">
            {payments.lines.some((l) => l.unknown)
              ? "Строка «не указан» — оплаты, у которых способ не проставили. Обычно так выходит, когда заявку закрывают кнопкой «Выполнена» мимо формы записи: деньги в кассе есть, а чем платили — неизвестно."
              : "У каждой оплаты проставлен способ — касса сходится."}{" "}
            Способ у занятия один: если клиент платил частями и разными
            способами, вся сумма попадёт в один столбец.
          </p>
        </section>
      )}

      {/* Графики: на телефоне — колонкой, на ПК — сеткой в 2–3 ряда
          с увеличенными отступами, чтобы блоки читались раздельно. */}
      <div className="mt-3 grid gap-3 lg:mt-6 lg:grid-cols-2 lg:gap-6 xl:grid-cols-3">
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
