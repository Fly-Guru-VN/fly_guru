import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadAllClients } from "@/lib/clients";
import { vnToday } from "@/lib/dates";
import { vnd } from "@/lib/stats";
import {
  cancelSubscriptionAction,
  deleteSubscriptionAction,
  togglePaidAction,
} from "../actions";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { EnteredBadge } from "@/components/cabinet/EnteredBadge";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { getActiveDict, embeddedName } from "@/lib/dictionaries";
import { loadPaymentClaims, type ClaimInfo } from "@/lib/subscriptions";
import { PAYMENT_CLAIM_BADGE, PAYMENT_CLAIM_TEXT } from "@/lib/paymentClaim";
import {
  SellSubscriptionForm,
  WriteOffMinutesForm,
  type SubscriptionPrefill,
} from "./SubscriptionForms";

export const metadata: Metadata = { title: "Админка · Абонементы" };

// Абонементы: остаток минут (всего + корректировки − списания), отметка
// оплаты (главный финансовый рубильник: без paid_at абонемент не входит
// ни в выручку, ни в комиссию), продажа от админа, корректировки с логом.

interface SubRow {
  id: string;
  total_minutes: number;
  price: number;
  sold_at: string;
  expires_at: string | null;
  status: string;
  paid_at: string | null;
  clients: { name: string } | null;
  seller: { name: string } | null;
}

interface HistoryItem {
  at: string;
  text: string;
}

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

// Короткая дата для карточек: «12.07.2026» по времени Нячанга.
function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
}

function SubscriptionCard({
  s,
  left,
  history,
  today,
  staff,
  paymentName,
  paymentMethods,
  claim,
}: {
  s: SubRow;
  left: number;
  history: HistoryItem[];
  today: string;
  // Кому записать прокат — тот же список, что в форме продажи.
  staff: { id: string; name: string }[];
  // Чем заплатили (0025). undefined — способ не записан: так бывает у продаж
  // до миграции и у тех, кому оплату отметили кнопкой задним числом.
  paymentName?: string;
  // Справочник для отметки оплаты задним числом.
  paymentMethods: { id: string; name: string }[];
  // Заявление инструктора об оплате (0032), если он его оставил.
  claim?: ClaimInfo;
}) {
  // Отменённый — продажа не состоялась (п.13). Проверяем первым: у него могли
  // и минуты кончиться, и срок выйти, но человеку важно одно — он отменён.
  const cancelled = s.status === "cancelled";
  const expired =
    s.status === "expired" ||
    (s.expires_at !== null && new Date(s.expires_at) < new Date());
  // «Сгорел» — истёк, а минуты остались: клиент их не откатал, деньги за них
  // школа получила. Именно это админ хотел видеть (пак E, пункт 9).
  const burned = !cancelled && expired && left > 0;

  // Заявление живо, только пока оплата не отмечена: подтвердил — вопрос закрыт.
  const pendingClaim = !cancelled && !s.paid_at && claim ? claim : null;

  // Остаток — главная цифра карточки: инструктор ищет глазами именно её,
  // поэтому она идёт рядом с именем и размером с него (пачка №10, пак 4).
  // Когда минут уже нет, на её месте — причина, почему их нет.
  const statusLabel = cancelled
    ? { text: "Отменён", cls: "text-muted" }
    : burned
      ? { text: `Сгорело ${left} мин`, cls: "text-red-600" }
      : expired
        ? { text: "Истёк", cls: "text-muted" }
        : s.status === "used_up"
          ? { text: "Минуты кончились", cls: "text-muted" }
          : { text: `${left} мин`, cls: "text-primary" };

  return (
    <details className="group rounded-2xl border border-line bg-surface">
      {/* Шапка — ровно два ряда: имя + остаток, под ними время внесения +
          статус оплаты. Раньше всё стояло одной строкой и на телефоне
          расплющивалось, а серая строка «дата · цена · продал» съедала место
          над плашками — она переехала внутрь карточки. */}
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate font-bold">
              {s.clients?.name ?? "Без клиента"}
            </p>
            <span className={`shrink-0 font-bold ${statusLabel.cls}`}>
              {statusLabel.text}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            {/* Когда абонемент реально внесли в базу — с точностью до минуты.
                По дате продажи «24.07» не понять, кто из смены его оформил. */}
            <EnteredBadge at={s.sold_at} />
            {/* У отменённого отметки оплаты нет по определению — не пугаем
                «ожидает оплаты» там, где платить уже нечего. */}
            {!cancelled && (
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  s.paid_at
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-amber-500/10 text-amber-600"
                }`}
              >
                {s.paid_at
                  ? `Оплачен ${fmtDay(s.paid_at)}`
                  : // Инструктор уже сказал, что деньги у школы — это не то же
                    // самое, что «клиент не заплатил» (0032).
                    pendingClaim
                    ? PAYMENT_CLAIM_BADGE[pendingClaim.claim]
                    : "Ожидает оплаты"}
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 text-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      <div className="border-t border-line/70 p-4 pt-3">
        <p className="text-sm text-muted">Истекает {fmtDay(s.expires_at)}</p>
        {/* Цена и продавец из шапки: в списке они не нужны (остаток важнее),
            но потерять их нельзя — по продавцу считается доля котла. */}
        <p className="mt-0.5 text-xs text-muted">
          Продан {fmtDay(s.sold_at)} · {vnd(s.price)} · продал{" "}
          {s.seller?.name ?? "—"} · {left} мин из {s.total_minutes}
        </p>

        {/* Чем заплатили — той же плашкой, что в ленте заявок, чтобы способ
            оплаты выглядел одинаково везде. */}
        {!cancelled &&
          (paymentName ? (
            <p className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-600">
              <span aria-hidden>💵</span>
              Оплата: {paymentName}
            </p>
          ) : (
            // Деньги получены, а чем — не записано. Показываем жёлтым, как в
            // заявках и сессиях: пустое место читалось бы как «поля нет».
            s.paid_at && (
              <p className="mt-2 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-600">
                <span aria-hidden>💵</span>
                Оплата: не указана
              </p>
            )
          ))}

        {/* Заявление инструктора об оплате (0032, пачка №10, п.5): деньги, по
            его словам, школа уже получила мимо CRM. Ставим прямо над кнопкой
            «Отметить оплату» — это и есть подтверждение. */}
        {pendingClaim && (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
            <p className="font-bold">{PAYMENT_CLAIM_BADGE[pendingClaim.claim]}</p>
            <p className="mt-1 text-xs">{PAYMENT_CLAIM_TEXT[pendingClaim.claim]}</p>
            {pendingClaim.note && (
              <p className="mt-1 text-xs">Пометка: «{pendingClaim.note}»</p>
            )}
            <p className="mt-1 text-xs opacity-80">
              {pendingClaim.by ?? "Инструктор"}
              {pendingClaim.at ? `, ${fmtDay(pendingClaim.at)}` : ""}
            </p>
          </div>
        )}

        {/* Отметка оплаты. У отменённого её нет: пока он в отменённых, деньги
            не должны попадать ни в выручку, ни в комиссию продавца. */}
        {!cancelled && (
        <form action={togglePaidAction} className="mt-3">
          <input type="hidden" name="id" value={s.id} />
          {s.paid_at ? (
            <>
              <input type="hidden" name="set" value="0" />
              <ConfirmSubmit
                message="Снять отметку оплаты? Абонемент выпадет из выручки и комиссии за месяц оплаты."
                className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-red-500 hover:text-red-500"
              >
                Снять отметку оплаты
              </ConfirmSubmit>
            </>
          ) : (
            // Сетка вместо flex-wrap с фиксированными w-40: нативный
            // датапикер на iOS держит свою ширину и налезал на «Формат
            // оплаты». min-w-0 + NATIVE_PICKER — та же схема, что в
            // «Сессиях» и «Статистике».
            <div>
              <input type="hidden" name="set" value="1" />
              <div className="grid grid-cols-2 items-end gap-2 sm:max-w-md">
                <label className="min-w-0 text-xs text-muted">
                  Дата оплаты
                  <input
                    type="date"
                    name="paidDate"
                    defaultValue={today}
                    max={today}
                    className={`mt-1 ${NATIVE_PICKER} ${inputClass}`}
                  />
                </label>
                {/* Спрашиваем и чем заплатили: раньше кнопка ставила только
                    дату, и абонемент, оплаченный задним числом, навсегда
                    оставался без способа оплаты — дозаполнить его было негде. */}
                <label className="min-w-0 text-xs text-muted">
                  Формат оплаты
                  <select
                    name="paymentMethodId"
                    defaultValue={paymentMethods[0]?.id ?? ""}
                    className={`mt-1 ${inputClass}`}
                  >
                    <option value="">— не указан —</option>
                    {paymentMethods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="submit"
                className="mt-3 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Отметить оплату
              </button>
            </div>
          )}
        </form>
        )}

        {/* Прокат: минуты откатаны — уходят сессией в ленту того дня (п.6) */}
        {!cancelled && (
          <div className="mt-4 border-t border-line/70 pt-3">
            <p className="text-xs font-semibold text-muted">
              Клиент откатал минуты
            </p>
            <WriteOffMinutesForm
              subscriptionId={s.id}
              staff={staff}
              today={today}
            />
          </div>
        )}

        {/* Формы корректировки минут здесь больше нет (пачка №10, пак 4).
            Она стояла рядом со списанием и выглядела как второй способ списать
            минуты — админ так и делал, а корректировки в «Сессии» не попадают:
            клиент откатал, а в ленте дня его нет (это и был баг №6 пачки №6).
            Старые корректировки никуда не делись — они в истории ниже и в
            остатке минут. */}

        {/* История: списания + корректировки */}
        {history.length > 0 && (
          <div className="mt-4 border-t border-line/70 pt-3">
            <p className="text-xs font-semibold text-muted">История минут</p>
            <ul className="mt-1 space-y-1 text-xs text-muted">
              {history.map((h, i) => (
                <li key={i}>{h.text}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Отмена — мягкая альтернатива удалению: карточка и история остаются,
            абонемент уходит во вкладку «Отменённые» (п.13). */}
        <form action={cancelSubscriptionAction} className="mt-4 border-t border-line/70 pt-3">
          <input type="hidden" name="id" value={s.id} />
          {cancelled ? (
            <>
              <input type="hidden" name="set" value="0" />
              <ConfirmSubmit
                message="Вернуть абонемент из отменённых? Статус пересчитается по остатку минут и сроку, а отметку оплаты нужно будет поставить заново."
                className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
              >
                Вернуть в активные
              </ConfirmSubmit>
            </>
          ) : (
            <>
              <input type="hidden" name="set" value="1" />
              <ConfirmSubmit
                message="Отменить абонемент? Он уйдёт во вкладку «Отменённые», отметка оплаты снимется — из выручки и комиссии продавца он выпадет. Списания и корректировки останутся."
                className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-red-500 hover:text-red-500"
              >
                Отменить абонемент
              </ConfirmSubmit>
            </>
          )}
        </form>

        <form action={deleteSubscriptionAction} className="mt-3">
          <input type="hidden" name="id" value={s.id} />
          <ConfirmSubmit
            message="Удалить абонемент? Его списания и корректировки удалятся безвозвратно, выручка и комиссия за месяц оплаты пересчитаются. Членство клиента останется."
            className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-red-500 hover:text-red-500"
          >
            Удалить абонемент
          </ConfirmSubmit>
        </form>
      </div>
    </details>
  );
}

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; booking?: string }>;
}) {
  const { f = "", booking: bookingId } = await searchParams;
  const today = vnToday();

  const supabase = await createClient();

  // Пришли из заявки на абонемент («Продать абонемент» в ленте заявок) —
  // тянем контакты клиента, чтобы форма открылась уже заполненной, а продажа
  // закрыла заявку. Так продажа с сайта не проваливается мимо минут/оплаты.
  let bookingPrefill: SubscriptionPrefill | undefined;
  if (bookingId) {
    const { data: b } = await supabase
      .from("bookings")
      .select(
        "id, status, client_name, phone, telegram_username, client_id, payment_method_id, payment:payment_methods(name)",
      )
      .eq("id", bookingId)
      .maybeSingle();
    if (b && !["done", "cancelled", "archived"].includes(b.status)) {
      bookingPrefill = {
        bookingId: b.id,
        name: b.client_name,
        phone: b.phone,
        telegram: b.telegram_username,
        clientId: b.client_id,
        // Способ оплаты уже выбран в карточке заявки — подставляем.
        paymentMethodId: b.payment_method_id,
        paymentMethodName: embeddedName(b.payment),
      };
    }
  }
  let subsQuery = supabase
    .from("subscriptions")
    .select(
      "id, total_minutes, price, sold_at, expires_at, status, paid_at, clients(name), seller:users!sold_by(name)",
    )
    .order("sold_at", { ascending: false })
    .limit(100);
  if (f === "burned") {
    // Кандидаты в «сгоревшие»: срок вышел, а минуты не докатаны (used_up
    // отсекаем — там докатали всё). Остаток >0 досчитаем в JS ниже.
    subsQuery = subsQuery
      .lt("expires_at", new Date().toISOString())
      .neq("status", "used_up");
  } else if (f === "archive") {
    // Архив — закончившиеся: срок вышел или минуты откатаны (п.13).
    subsQuery = subsQuery.in("status", ["expired", "used_up"]);
  } else if (f === "cancelled") {
    subsQuery = subsQuery.eq("status", "cancelled");
  } else if (f !== "all") {
    subsQuery = subsQuery.eq("status", "active");
  }

  const [subsRes, clientsRes, staffRes, paymentMethods] = await Promise.all([
    subsQuery,
    // Полный список клиентов постранично (lib/clients): .limit(1000) молча
    // обрезал бы выпадающий список — клиента просто не было бы в выборе.
    loadAllClients<{ id: string; name: string; phone: string | null }>(
      supabase,
      "id, name, phone",
    ),
    supabase
      .from("users")
      .select("id, name")
      .in("role", ["instructor", "admin"])
      .order("name"),
    getActiveDict(supabase, "payment_methods"),
  ]);

  const subs = (subsRes.data ?? []) as unknown as SubRow[];
  const ids = subs.map((s) => s.id);

  // Заявления об оплате (0032): «деньги принял админ», «с оплатой непонятно».
  // Отдельным мягким запросом — по той же причине, что и способ оплаты ниже.
  const claimBySub = await loadPaymentClaims(supabase, ids);

  // Способ оплаты (0025) тянем ОТДЕЛЬНЫМ запросом, а не в общем select: пока
  // миграция не накатана, колонки нет — и такой select уронил бы всю страницу
  // абонементов. Здесь же ошибка просто оставит блок оплаты пустым.
  const paymentBySub = new Map<string, string>();
  if (ids.length) {
    const { data: payRows } = await supabase
      .from("subscriptions")
      .select("id, payment:payment_methods(name)")
      .in("id", ids);
    for (const r of payRows ?? []) {
      const name = (r.payment as unknown as { name: string } | null)?.name;
      if (name) paymentBySub.set(r.id as string, name);
    }
  }

  // По алфавиту — см. комментарий в admin/members: загрузчик отдаёт по id.
  const clients = [...clientsRes.rows].sort((a, b) =>
    a.name.localeCompare(b.name, "ru"),
  );

  // Балансы и история — двумя батч-запросами на весь список сразу.
  const [usedRes, adjRes] = ids.length
    ? await Promise.all([
        supabase
          .from("sessions")
          .select("subscription_id, minutes_used, date, instructor:users!instructor_id(name)")
          .in("subscription_id", ids),
        supabase
          .from("subscription_adjustments")
          .select("subscription_id, delta_minutes, comment, created_at, author:users!created_by(name)")
          .in("subscription_id", ids),
      ])
    : [{ data: [] }, { data: [] }];

  const usedBySub = new Map<string, number>();
  const historyBySub = new Map<string, HistoryItem[]>();
  const push = (id: string, item: HistoryItem) => {
    historyBySub.set(id, [...(historyBySub.get(id) ?? []), item]);
  };

  for (const r of usedRes.data ?? []) {
    const id = r.subscription_id as string;
    usedBySub.set(id, (usedBySub.get(id) ?? 0) + (r.minutes_used ?? 0));
    const instructor = (r.instructor as unknown as { name: string } | null)?.name ?? "?";
    push(id, {
      at: r.date as string,
      text: `${fmtDay(r.date as string)} · списание ${r.minutes_used ?? 0} мин — ${instructor}`,
    });
  }
  const adjBySub = new Map<string, number>();
  for (const r of adjRes.data ?? []) {
    const id = r.subscription_id as string;
    const delta = (r.delta_minutes as number) ?? 0;
    adjBySub.set(id, (adjBySub.get(id) ?? 0) + delta);
    const author = (r.author as unknown as { name: string } | null)?.name ?? "?";
    push(id, {
      at: r.created_at as string,
      text: `${fmtDay(r.created_at as string)} · корректировка ${delta > 0 ? "+" : ""}${delta} мин — ${r.comment} (${author})`,
    });
  }
  for (const items of historyBySub.values()) {
    items.sort((a, b) => b.at.localeCompare(a.at));
  }

  // Остаток минут: всего + корректировки − списания. Нужен и для карточки, и
  // для отбора «сгоревших» (истёк с ненулевым остатком).
  const leftOf = (s: SubRow) =>
    s.total_minutes + (adjBySub.get(s.id) ?? 0) - (usedBySub.get(s.id) ?? 0);
  // «Сгоревшие» — только с ненулевым остатком; отменённые сюда не относятся
  // (деньги вернули, гореть нечему). Отсев в JS, а не в запросе: так экран не
  // ломается на проектах, где миграцию 0023 ещё не накатили.
  const visibleSubs =
    f === "burned"
      ? subs.filter((s) => leftOf(s) > 0 && s.status !== "cancelled")
      : subs;

  return (
    <div>
      <h1 className="text-2xl font-bold">Абонементы</h1>
      <p className="mt-1 text-sm text-muted">
        Пока нет отметки оплаты, абонемент — «ожидает»: он не входит в выручку
        и комиссию продавца. Минуты списываются только прокатом — он попадает в
        «Сессии» того дня, к нему можно добавить комментарий.
      </p>

      <details className="mt-4 rounded-2xl border border-line bg-surface" open={Boolean(bookingPrefill)}>
        <summary className="cursor-pointer list-none p-4 font-semibold text-primary [&::-webkit-details-marker]:hidden">
          + Продать абонемент
        </summary>
        <div className="border-t border-line/70 p-4 pt-3">
          {bookingPrefill && (
            <p className="mb-3 rounded-xl bg-primary/10 px-3 py-2 text-xs text-primary">
              Заявка на абонемент от <b>{bookingPrefill.name}</b> — продажа закроет её.
            </p>
          )}
          <SellSubscriptionForm
            clients={clients}
            staff={staffRes.data ?? []}
            today={today}
            paymentMethods={paymentMethods}
            prefill={bookingPrefill}
          />
        </div>
      </details>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {[
          { key: "", label: "Активные" },
          { key: "burned", label: "Сгоревшие" },
          { key: "archive", label: "Архив" },
          { key: "cancelled", label: "Отменённые" },
          { key: "all", label: "Все" },
        ].map((tab) => (
          <Link
            key={tab.key}
            href={tab.key ? `/admin/subscriptions?f=${tab.key}` : "/admin/subscriptions"}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              f === tab.key
                ? "bg-primary text-white"
                : "border border-line text-muted hover:border-primary hover:text-primary"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {visibleSubs.length === 0 && (
        <p className="mt-6 text-sm text-muted">
          {f === "burned"
            ? "Сгоревших абонементов нет — ни у кого минуты не прогорели."
            : f === "archive"
              ? "В архиве пусто — ни один абонемент ещё не закончился."
              : f === "cancelled"
                ? "Отменённых абонементов нет."
                : "Абонементов пока нет."}
        </p>
      )}
      <div className="mt-4 space-y-3">
        {visibleSubs.map((s) => (
          <SubscriptionCard
            key={s.id}
            s={s}
            left={leftOf(s)}
            history={historyBySub.get(s.id) ?? []}
            today={today}
            staff={staffRes.data ?? []}
            paymentName={paymentBySub.get(s.id)}
            paymentMethods={paymentMethods}
            claim={claimBySub.get(s.id)}
          />
        ))}
      </div>
    </div>
  );
}
