import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { vnToday } from "@/lib/dates";
import {
  confirmBookingAction,
  saveBookingAction,
  togglePinAction,
  setStatusAction,
  rescheduleAction,
  coverBookingAction,
} from "../actions";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { vnd } from "@/lib/stats";
import { channelLabel } from "@/lib/channels";
import { resolveRefOwners, refOwnerLabel, type RefOwner } from "@/lib/refOwner";
import { firstBasicTrainingByPhone } from "@/lib/agentReward";
import { SaveForm } from "../SaveForm";
import { getActiveDict } from "@/lib/dictionaries";
import { BookingCreateForm } from "./BookingCreateForm";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { sortServicesByType } from "@/lib/serviceOrder";

export const metadata: Metadata = { title: "Админка · Заявки" };

// Лента «Актуальные заявки»: полный цикл new → contacted → confirmed →
// done/cancelled/archived. «Ожидает оплату» — не отдельный статус, а
// подтверждённая запись, которую уже принял инструктор (accepted_by).
// «Перенесена» — бейдж по rescheduled_at, статус при этом живёт дальше.
//
// Галочка «Клиент уже оплатил» (paid, 0036) отменяет «Ожидает оплату»: деньги
// у школы, ждём только занятия. Раньше бейдж считался по одному accepted_by, и
// оплаченная заявка после принятия инструктором всё равно писала «Ожидает
// оплату» — админ видел в ленте долг, которого нет.

interface BookingRow {
  id: string;
  booking_no: number | null;
  client_name: string;
  phone: string;
  telegram_username: string | null;
  preferred_date: string | null;
  scheduled_time: string | null;
  age: number | null;
  weight: number | null;
  status: string;
  pinned: boolean;
  ref_code: string | null;
  src: string | null;
  city: string | null;
  utm: Record<string, string> | null;
  internal_note: string | null;
  client_id: string | null;
  rescheduled_at: string | null;
  created_at: string;
  services: { name: string; category: string } | null;
  accepted: { name: string } | null;
  payment_method_id: string | null;
  payment: { name: string } | null;
  paid: boolean | null; // деньги получены до занятия (0036)
  // Чем закрыта заявка (0038): занятием или продажей абонемента. null у всех
  // заявок, закрытых до этой миграции, и у закрытых кнопкой «Выполнена».
  subscription_id: string | null;
  session: SessionLink | null;
}

// Занятие, которым закрыта заявка. Одно занятие может закрывать несколько
// заявок — парное обучение записывают одной сессией на двоих.
interface SessionLink {
  id: string;
  date: string;
  amount: number | null;
  services: { name: string } | null;
  instructor: { name: string } | null;
  clients?: { name: string } | null;
}

const TERMINAL = ["done", "cancelled", "archived"];

// Заявка, которая закончилась занятием (а не отказом). У «выполнена» это видно
// по статусу; в архиве статус уже общий для всех закрытых, поэтому смотрим на
// клиента: его привязывает оформление занятия, у отменённых заявок его нет.
// Нужно, чтобы не пугать «оплата не указана» там, где клиент просто не пришёл.
function isClosedDeal(b: BookingRow): boolean {
  return b.status === "done" || (b.status === "archived" && b.client_id !== null);
}

// Заявка закрыта, а чем — неизвестно: занятия нет, абонемента нет (0038).
// Так выглядят заявки, закрытые кнопкой «Выполнена» мимо «Записать клиента»:
// клиент откатал, а в выручке, статистике и ЗП инструктора этого нет.
//
// linksReady — накатана ли 0038. Пока колонок нет, связи нет НИ У ОДНОЙ заявки,
// и подсказка висела бы на всех закрытых сразу, пугая на ровном месте. Заявки,
// закрытые до наката, останутся без связи и после него — их привязывают руками
// один раз, кнопкой «Клиент учтён в другом занятии»; поэтому формулировка
// нейтральная («не привязано»), а не обвинительная.
function isDealWithoutSession(b: BookingRow, linksReady: boolean): boolean {
  return linksReady && isClosedDeal(b) && !b.session && !b.subscription_id;
}

// Заявка принята инструктором и ждёт занятия. Именно здесь бейдж говорит про
// деньги — поэтому здесь же учитывается отметка «уже оплатил».
function isAwaiting(b: BookingRow): boolean {
  return b.status === "confirmed" && Boolean(b.accepted);
}

// Подпись и цвет бейджа. «Ожидает оплату» вычисляем из accepted.
function statusBadge(b: BookingRow): { label: string; cls: string } {
  if (isAwaiting(b))
    return b.paid
      ? { label: "Оплачена", cls: "bg-emerald-500/10 text-emerald-600" }
      : { label: "Ожидает оплату", cls: "bg-purple-500/10 text-purple-600" };
  const map: Record<string, { label: string; cls: string }> = {
    // Залитый бейдж, а не бледная плашка: новая заявка — единственный статус,
    // требующий действия прямо сейчас, и на телефоне её видно первой.
    new: { label: "Новая", cls: "bg-red-500 text-white" },
    contacted: { label: "В обработке", cls: "bg-amber-500/10 text-amber-600" },
    confirmed: { label: "Подтверждена", cls: "bg-primary/10 text-primary" },
    done: { label: "Выполнена", cls: "bg-emerald-500/10 text-emerald-600" },
    cancelled: { label: "Отменена", cls: "bg-line text-muted" },
    archived: { label: "Архив", cls: "bg-line text-muted" },
  };
  return map[b.status] ?? { label: b.status, cls: "bg-line text-muted" };
}

// Приоритет в ленте: закреплённые → новые → в обработке → подтверждённые →
// ожидающие оплату; выполненные/отменённые всегда внизу.
function rank(b: BookingRow): number {
  if (TERMINAL.includes(b.status)) return 100;
  if (b.pinned) return 0;
  if (b.status === "new") return 1;
  if (b.status === "contacted") return 2;
  if (b.status === "confirmed" && !b.accepted) return 3;
  return 4;
}

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";
const btnGhost =
  "rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary";
const btnAccent =
  "rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-strong";

// Карточка заявки: свёрнута — одна строка, тап раскрывает детали и действия.
function BookingCard({
  b,
  today,
  hasPendingReward,
  refOwner,
  refDiscount,
  paymentMethods,
  coverCandidates,
  linksReady,
}: {
  b: BookingRow;
  today: string;
  hasPendingReward: boolean;
  // Владелец реф-ссылки заявки: агент (скидка + награда) или инструктор
  // (просто «записался к нему»). undefined — код есть, а владельца не нашли.
  refOwner: RefOwner | undefined;
  // Положена ли скидка этому гостю на самом деле; undefined — не проверяли.
  refDiscount?: boolean;
  paymentMethods: { id: string; name: string }[];
  // Занятия, к которым эту заявку можно привязать: соседние по дате, чтобы в
  // списке не оказалась вся история школы.
  coverCandidates: SessionLink[];
  // Накатана ли 0038: до неё связей нет ни у кого, и подсказки про
  // непривязанное занятие показывать нельзя.
  linksReady: boolean;
}) {
  const badge = statusBadge(b);
  const terminal = TERMINAL.includes(b.status);
  const utmEntries = Object.entries(b.utm ?? {});

  return (
    <details
      className={`group rounded-2xl border bg-surface ${
        b.pinned && !terminal
          ? "border-red-400 shadow-[0_0_14px_rgba(248,113,113,0.35)]"
          : b.status === "new"
            ? // Необработанная заявка выделяется и самой карточкой: в длинной
              // ленте бейдж в правом краю строки взгляд проскакивал.
              "border-red-300"
            : "border-line"
      }`}
    >
      {/* Свёрнутая строка */}
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className={`truncate font-bold ${terminal ? "text-muted" : ""}`}>
            {b.pinned && !terminal && <span title="Закреплена">📌 </span>}
            {b.booking_no != null && (
              <span className="text-muted">#{b.booking_no} </span>
            )}
            {b.client_name}
          </p>
          {/* Услуга — своей строкой и заметно: раньше она шла мелким серым
              текстом вперемешку с датой и терялась (prompts 3, п.2). */}
          <p
            className={`truncate text-sm font-semibold ${terminal ? "text-muted" : "text-ink"}`}
          >
            {b.services?.name ?? "Услуга не указана"}
          </p>
          <p className="truncate text-xs text-muted">
            {[b.preferred_date === today ? "Сегодня" : b.preferred_date, b.scheduled_time]
              .filter(Boolean)
              .join(" · ") || "Детали не заполнены"}
          </p>
        </div>
        {b.rescheduled_at && !terminal && (
          <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-600">
            Перенесена
          </span>
        )}
        {/* Деньги уже у школы, а бейдж статуса про это не говорит (заявка ещё
            новая, в обработке или её не принял инструктор). Плашка нужна прямо
            в свёрнутой строке: раньше отметку было видно только внутри
            раскрытой карточки, и в ленте оплаченная заявка ничем не
            отличалась от неоплаченной. */}
        {b.paid && !terminal && !isAwaiting(b) && (
          <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-600">
            ✅ Оплачена
          </span>
        )}
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
        <span className="text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>

      {/* Раскрытая карточка */}
      <div className="border-t border-line/70 p-4 pt-3">
        <div className="space-y-0.5 text-sm">
          <a href={`tel:${b.phone}`} className="text-primary underline">
            {b.phone}
          </a>
          {/* Ник в телеге приходит с сайта (0018) — второй способ достучаться,
              когда номер не отвечает. */}
          {b.telegram_username && (
            <a
              href={`https://t.me/${b.telegram_username}`}
              target="_blank"
              rel="noreferrer"
              className="block text-primary underline"
            >
              @{b.telegram_username}
            </a>
          )}
          {b.accepted && (
            <p className="text-muted">
              Принял: <span className="text-primary">{b.accepted.name}</span>
            </p>
          )}
        </div>

        {/* Чем платят. Отдельной заметной плашкой, а не строчкой в общем
            списке: способ оплаты ищут глазами (пачка №5, чек-лист админки).
            Проставляется сам, когда заявку доводят до занятия. */}
        {/* «Уже оплачено» (0036) — про то, что деньги УЖЕ у школы, а не про то,
            чем платят. Живой случай: написал в инстаграм, сразу перевёл,
            катается послезавтра. Отдельной плашкой, чтобы инструктор увидел её
            на пляже и не спросил деньги второй раз. */}
        {b.paid && (
          <p className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-600">
            <span aria-hidden>✅</span>
            Клиент уже оплатил{b.payment ? ` · ${b.payment.name}` : ""}
          </p>
        )}

        {!b.paid && b.payment ? (
          <p className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-600">
            <span aria-hidden>💵</span>
            Оплата: {b.payment.name}
          </p>
        ) : !b.paid && (
          // Заявку довели до занятия, а чем расплатились — не записано. Так
          // бывает, когда её закрыли кнопкой «Выполнена» вручную, минуя
          // «Записать клиента»: способ оплаты там никто не спрашивает. Раньше
          // в этом случае не было видно НИЧЕГО, и пустота читалась как «такого
          // поля нет». Теперь видно, что данные не внесли, — а поправить можно
          // в списке «Формат оплаты» ниже.
          isClosedDeal(b) && (
            <p className="mt-2 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-600">
              <span aria-hidden>💵</span>
              Оплата: не указана
            </p>
          )
        )}

        {/* Чем закрыта заявка (0038). Раньше между заявкой и занятием не было
            связи вообще: по «Выполнена» нельзя было сказать, состоялось ли
            занятие и на какую сумму, — приходилось искать клиента в «Сессиях»
            руками. */}
        {b.session && (
          <Link
            href="/admin/sessions"
            className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-line/20 px-3 py-2 text-sm text-muted transition-colors hover:border-primary"
          >
            <span aria-hidden>🏄</span>
            <span className="min-w-0">
              Занятие:{" "}
              <span className="font-semibold text-ink">
                {b.session.services?.name ?? "услуга не указана"}
              </span>{" "}
              · {b.session.date} · {vnd(b.session.amount ?? 0)}
              {b.session.instructor?.name ? ` · ${b.session.instructor.name}` : ""}
            </span>
          </Link>
        )}

        {b.subscription_id && !b.session && (
          <p className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-line/20 px-3 py-2 text-sm text-muted">
            <span aria-hidden>🎟️</span>
            Закрыта продажей абонемента
          </p>
        )}

        {/* Закрыта, а занятия за ней не числится. */}
        {isDealWithoutSession(b, linksReady) && (
          <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
            <span className="font-bold">Занятие не привязано.</span> Заявка
            закрыта, но занятия за ней в базе нет — значит, выручка и 15%
            инструктору по ней не посчитаны. Если клиент катался, проведите её
            через «Записать клиента» или укажите занятие, в котором он учтён.
          </p>
        )}

        {/* Атрибуция: откуда пришёл клиент */}
        {(b.src || b.city || b.ref_code || utmEntries.length > 0) && (
          <div className="mt-2 space-y-0.5 rounded-xl bg-line/30 px-3 py-2 text-xs text-muted">
            {b.src && <p>Канал записи: {channelLabel(b.src)}</p>}
            {/* Города нет у заявок с сайта и у всех старых — там строки просто
                не будет, а вписать город можно в полях ниже. */}
            {b.city && <p>Город: {b.city}</p>}
            {/* Вместо сырого кода — имя того, кто привёл гостя, и правда про
                скидку: её даёт только активная агентская ссылка (п.4/5). */}
            {b.ref_code && <p>{refOwnerLabel(b.ref_code, refOwner, refDiscount)}</p>}
            {utmEntries.map(([k, v]) => (
              <p key={k}>
                {k}: {v}
              </p>
            ))}
          </div>
        )}

        {/* Поля созвона + основные действия. Кнопки статусов ниже идут через
            свой formAction — мимо SaveForm: у них обратная связь своя, меняется
            бейдж карточки. SaveForm подтверждает именно «Сохранить». */}
        <SaveForm
          action={b.status === "new" ? confirmBookingAction : saveBookingAction}
          className="mt-3"
        >
          <input type="hidden" name="id" value={b.id} />
          <input type="hidden" name="pinned" value={b.pinned ? "1" : "0"} />

          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-muted">
              Время прихода
              <input
                type="text"
                name="scheduledTime"
                defaultValue={b.scheduled_time ?? ""}
                placeholder="10:30"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-muted">
              Возраст
              <input
                type="number"
                name="age"
                defaultValue={b.age ?? ""}
                min={1}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-muted">
              Вес, кг
              <input
                type="number"
                name="weight"
                defaultValue={b.weight ?? ""}
                min={1}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>
          {/* Город: у заявок с сайта его нет (гость не указывает), у ручных он
              приходит из формы. Здесь дописывают или правят. */}
          <label className="mt-2 block text-xs text-muted">
            Город
            <input
              type="text"
              name="city"
              defaultValue={b.city ?? ""}
              placeholder="Nha Trang"
              className={`mt-1 ${inputClass}`}
            />
          </label>
          {/* Формат оплаты можно проставить руками (договорились по телефону)
              или поправить — сам он приезжает при проведении заявки. */}
          <label className="mt-2 block text-xs text-muted">
            Формат оплаты
            <select
              name="paymentMethodId"
              defaultValue={b.payment_method_id ?? ""}
              className={`mt-1 ${inputClass}`}
            >
              <option value="">— не указан —</option>
              {paymentMethods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {/* Способ мог быть скрыт в справочнике уже после оплаты — иначе
                  select не нашёл бы своё значение и сохранение затёрло бы его. */}
              {b.payment_method_id &&
                !paymentMethods.some((p) => p.id === b.payment_method_id) && (
                  <option value={b.payment_method_id}>
                    {b.payment?.name ?? "прежний способ"}
                  </option>
                )}
            </select>
          </label>
          {/* «Уже оплатил» (0036): гость перевёл деньги при переписке, а
              катается позже. Инструктор увидит отметку в карточке и не станет
              спрашивать деньги второй раз. На выручку не влияет — она
              считается по занятию. */}
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="paidMark"
              defaultChecked={Boolean(b.paid)}
              className="h-4 w-4 accent-primary"
            />
            Клиент уже оплатил
          </label>
          <label className="mt-2 block text-xs text-muted">
            Заметка (пожелания клиента, договорённости — видна инструкторам)
            <textarea
              name="note"
              rows={2}
              defaultValue={b.internal_note ?? ""}
              className={`mt-1 ${inputClass}`}
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            {(b.status === "new" || b.status === "contacted") && (
              <button type="submit" formAction={confirmBookingAction} className={btnAccent}>
                Подтвердить → в записи
              </button>
            )}
            {b.status === "new" && (
              <button
                formAction={setStatusAction.bind(null, "contacted")}
                className={btnGhost}
              >
                В обработку
              </button>
            )}
            {!terminal && b.status !== "new" && (
              <button type="submit" className={btnGhost}>
                Сохранить
              </button>
            )}
            {b.status === "confirmed" && (
              <>
                {/* «Выполнена» закрывает заявку БЕЗ занятия: сессия не пишется,
                    деньги и 15% инструктору не считаются. Кнопка выглядела как
                    обычное «готово», и ею закрывали проведённых клиентов — в
                    отчётах их потом не было. Правильный путь — «Записать
                    клиента» рядом; для второго человека из парного занятия —
                    «Учтена в занятии» ниже. */}
                <ConfirmSubmit
                  message={
                    "Закрыть заявку БЕЗ занятия?\n\nВыручка и 15% инструктору по ней не посчитаются.\n\nЕсли клиент катался — нажмите «Записать клиента».\nЕсли он уже внутри чужого занятия (парное обучение) — «Учтена в занятии»."
                  }
                  formAction={setStatusAction.bind(null, "done")}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  Выполнена
                </ConfirmSubmit>
                <button formAction={togglePinAction} className={btnGhost}>
                  {b.pinned ? "Открепить" : "Закрепить"}
                </button>
              </>
            )}
            {!terminal && (
              // Провести заявку. Абонемент — не сессия: ведём на форму продажи
              // абонемента (там минуты/членство/оплата), иначе на «Запись
              // клиента». В обоих случаях сохранение закроет заявку (done).
              <Link
                href={
                  b.services?.category === "subscription"
                    ? `/admin/subscriptions?booking=${b.id}`
                    : `/admin/record?booking=${b.id}`
                }
                className={btnGhost}
              >
                {b.services?.category === "subscription" ? "Продать абонемент" : "Записать клиента"}
              </Link>
            )}
            {!terminal && (
              <button
                formAction={setStatusAction.bind(null, "cancelled")}
                className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-red-500 hover:text-red-500"
              >
                Отменить
              </button>
            )}
            {b.status === "done" && hasPendingReward && (
              <button
                formAction={setStatusAction.bind(null, "done")}
                className={btnAccent}
              >
                Подтвердить реф-награду
              </button>
            )}
            {(b.status === "done" || b.status === "cancelled") && (
              <button
                formAction={setStatusAction.bind(null, "archived")}
                className={btnGhost}
              >
                В архив
              </button>
            )}
          </div>
        </SaveForm>

        {/* «Учтена в занятии» (0038). Парное обучение — это одна сессия на
            двоих, а заявок две. Вторую раньше оставалось только отменить, и
            человек, который реально катался, оказывался в CRM отказом. Теперь
            она встаёт «Выполнена» и указывает на то же занятие; денег это не
            добавляет — выручка живёт на сессии, а сессия одна.
            Свёрнуто в details: нужно это редко, а место в карточке дорогое. */}
        {/* Отменённым блок тоже нужен, и это главный случай: заявку-спутника
            до сих пор закрывали именно «Отменить» (заявка 76 от 11.08 —
            дочка, которая каталась в парном занятии мамы). Такую отмену
            исправляют здесь: заявка станет выполненной и укажет на занятие. */}
        {linksReady &&
          b.status !== "new" &&
          (!terminal ||
            b.status === "cancelled" ||
            isDealWithoutSession(b, linksReady)) &&
          coverCandidates.length > 0 && (
          <details className="mt-3 rounded-xl border border-line bg-line/10 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-muted">
              Клиент учтён в другом занятии
            </summary>
            <form action={coverBookingAction} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={b.id} />
              <label className="min-w-0 flex-1 text-xs text-muted">
                Занятие
                <select name="sessionId" required className={`mt-1 ${inputClass}`}>
                  {coverCandidates.map((s) => (
                    <option key={s.id} value={s.id}>
                      {[
                        s.clients?.name ?? "клиент",
                        s.services?.name ?? "услуга",
                        s.date,
                        vnd(s.amount ?? 0),
                      ].join(" · ")}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className={btnGhost}>
                Учтена
              </button>
            </form>
            <p className="mt-2 text-[11px] text-muted">
              Для второго человека из парного занятия: заявка закроется как
              выполненная, второй раз деньги не посчитаются.
            </p>
          </details>
        )}

      {/* Перенос: новая дата/время, статус остаётся живым */}
        {!terminal && (
          <form action={rescheduleAction} className="mt-3 flex items-end gap-2">
            <input type="hidden" name="id" value={b.id} />
            {/* min-w-0: иначе нативный датапикер не даёт ячейке ужаться и
                выталкивает кнопку «Перенести» за экран (см. NATIVE_PICKER). */}
            <label className="min-w-0 flex-1 text-xs text-muted">
              Перенести на
              <input
                type="date"
                name="newDate"
                required
                className={`mt-1 ${NATIVE_PICKER} ${inputClass}`}
              />
            </label>
            <label className="w-24 text-xs text-muted">
              Время
              <input
                type="text"
                name="newTime"
                placeholder="10:30"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <button type="submit" className={btnGhost}>
              Перенести
            </button>
          </form>
        )}
      </div>
    </details>
  );
}

// Чипсы-фильтры по статусу (обычные ссылки — страница серверная).
const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "Все" },
  { key: "new", label: "Новые" },
  { key: "contacted", label: "В обработке" },
  { key: "confirmed", label: "Подтверждены" },
  { key: "awaiting", label: "Ждут оплату" },
  { key: "done", label: "Выполнены" },
  { key: "cancelled", label: "Отменены" },
  { key: "archived", label: "Архив" },
];

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: filter = "" } = await searchParams;
  const supabase = await createClient();
  const today = vnToday();
  const paymentMethods = await getActiveDict(supabase, "payment_methods");

  // Услуги для формы ручной заявки. Абонемент отсюда исключён намеренно: его
  // продают через /admin/subscriptions, иначе продажа пройдёт мимо минут
  // и membership (та же дыра, что чинили в 4.8).
  const { data: serviceRows } = await supabase
    .from("services")
    .select("id, name, category, code")
    .eq("active", true)
    .neq("category", "subscription");
  // Порядок «по типажам» (lib/serviceOrder.ts).
  const services = sortServicesByType(serviceRows ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
  }));

  // Колонка paid добавлена в 0036: до наката её нет, и с ней запрос падает
  // целиком — а вместе с ним лента заявок. Поэтому при ошибке перечитываем без
  // неё (та же страховка, что у колонок премии в lib/salary).
  const bookingCols =
    "id, booking_no, client_name, phone, telegram_username, preferred_date, scheduled_time, age, weight, status, pinned, ref_code, src, city, utm, internal_note, client_id, rescheduled_at, created_at, payment_method_id, services(name, category), accepted:users!accepted_by(name), payment:payment_methods(name)";
  const bookingsQuery = (columns: string) =>
    supabase
      .from("bookings")
      .select(columns)
      .order("created_at", { ascending: false })
      .limit(200);

  // Колонки 0038 (чем закрыта заявка) читаем тем же приёмом: не накатили —
  // отваливаемся на прежний набор, лента продолжает работать.
  const sessionCols =
    "subscription_id, session:sessions!session_id(id, date, amount, services(name), instructor:users!instructor_id(name))";
  let res = await bookingsQuery(`${bookingCols}, paid, ${sessionCols}`);
  // Первый запрос прошёл — значит колонки связи в базе есть, и «занятие не
  // привязано» действительно означает дыру, а не ненакатанную миграцию.
  const linksReady = !res.error;
  if (res.error) res = await bookingsQuery(`${bookingCols}, paid`);
  if (res.error) res = await bookingsQuery(bookingCols);

  const all = (res.data ?? []) as unknown as BookingRow[];

  // Фильтр: «Все» скрывает архив, остальные чипсы показывают свой срез.
  let bookings = all;
  if (filter === "awaiting") {
    // Оплаченные сюда не попадают: в этом срезе админ ищет, с кого ещё взять
    // деньги, — заявка с галочкой «уже оплатил» там только мешает.
    bookings = all.filter((b) => isAwaiting(b) && !b.paid);
  } else if (filter === "confirmed") {
    bookings = all.filter((b) => b.status === "confirmed" && !b.accepted);
  } else if (filter) {
    bookings = all.filter((b) => b.status === filter);
  } else {
    bookings = all.filter((b) => b.status !== "archived");
  }

  // Сортировка: приоритет статуса, внутри активных — ближайшая дата,
  // внутри закрытых — свежие сверху (created_at уже desc из запроса).
  bookings = [...bookings].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (TERMINAL.includes(a.status)) return 0;
    return (a.preferred_date ?? "9999").localeCompare(b.preferred_date ?? "9999");
  });

  // У каких выполненных заявок ещё висит неподтверждённая награда агента.
  const doneClientIds = bookings
    .filter((b) => b.status === "done" && b.ref_code && b.client_id)
    .map((b) => b.client_id as string);
  let pendingRewardClients = new Set<string>();
  if (doneClientIds.length > 0) {
    const { data: rewards } = await supabase
      .from("referral_rewards")
      .select("client_id")
      .eq("status", "pending")
      .in("client_id", doneClientIds);
    pendingRewardClients = new Set((rewards ?? []).map((r) => r.client_id as string));
  }

  // Реф-коды видимых заявок → имена владельцев ссылок (агент или инструктор).
  const refOwners = await resolveRefOwners(
    supabase,
    bookings.map((b) => b.ref_code),
  );

  // Кому из пришедших по агентской ссылке скидка реально положена. Спрашиваем
  // только про них: у остальных заявок реф-строки нет, и проверять нечего.
  const agentPhones = bookings
    .filter((b) => b.ref_code && refOwners.get(b.ref_code)?.kind === "agent")
    .map((b) => b.phone);
  const refDiscounts = await firstBasicTrainingByPhone(supabase, agentPhones);

  const freshCount = all.filter((b) => b.status === "new").length;

  // Занятия последних двух недель — из них выбирают «в каком занятии учтён»
  // второй человек парной записи. Две недели, а не вся история: привязывают
  // заявку к занятию по горячим следам, а длинный список на телефоне
  // нелистаемый. В карточке из них остаются соседние по дате (±3 дня).
  const coverFrom = new Date(`${today}T00:00:00Z`);
  coverFrom.setUTCDate(coverFrom.getUTCDate() - 14);
  const { data: recentSessionRows } = await supabase
    .from("sessions")
    .select("id, date, amount, clients(name), services(name), instructor:users!instructor_id(name)")
    .gte("date", coverFrom.toISOString().slice(0, 10))
    .order("date", { ascending: false })
    .limit(200);
  const recentSessions = (recentSessionRows ?? []) as unknown as SessionLink[];

  // Соседние по дате занятия: считаем от дня, на который записан гость, а если
  // даты нет — от дня создания заявки.
  const coverCandidatesFor = (b: BookingRow): SessionLink[] => {
    const anchor = b.preferred_date ?? b.created_at.slice(0, 10);
    const from = new Date(`${anchor}T00:00:00Z`);
    const to = new Date(from);
    from.setUTCDate(from.getUTCDate() - 3);
    to.setUTCDate(to.getUTCDate() + 3);
    const fromDay = from.toISOString().slice(0, 10);
    const toDay = to.toISOString().slice(0, 10);
    return recentSessions.filter(
      (s) => s.date >= fromDay && s.date <= toDay && s.id !== b.session?.id,
    );
  };

  return (
    <div>
      {/* Живое обновление ленты и бейджа — в layout кабинета (BookingsBadgeRefresh). */}
      <PageHeader
        title="Актуальные заявки"
        badge={freshCount}
        hint={
          freshCount > 0
            ? `Новых, с которыми ещё не работали: ${freshCount}`
            : "Новых заявок нет — все разобраны"
        }
      />

      {/* Фильтры и создание заявки — одной строкой: это управление лентой, а не
          её содержимое. Раньше форма стояла отдельным блоком над фильтрами и
          отодвигала сами заявки вниз. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key ? `/admin/bookings?status=${f.key}` : "/admin/bookings"}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === f.key
                  ? "bg-primary text-white"
                  : "border border-line text-muted hover:border-primary hover:text-primary"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <BookingCreateForm
          services={services}
          today={today}
          paymentMethods={paymentMethods}
        />
      </div>

      {/* Порядок работы держим под рукой, но свёрнутым: читают его один раз,
          а место занимало всегда. */}
      <details className="mt-3">
        <summary className="cursor-pointer list-none text-xs font-semibold text-muted transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
          Как работать с заявкой ▾
        </summary>
        <p className="mt-1 text-sm text-muted">
          Клик по заявке раскрывает карточку. Созвонились → внесите время,
          возраст, вес → «Подтвердить»: запись увидят инструкторы. Позвонили или
          написали напрямую — заведите заявку сами кнопкой «Новая заявка».
        </p>
      </details>

      {bookings.length === 0 && (
        <p className="mt-6 text-sm text-muted">Здесь пока пусто.</p>
      )}
      <div className="mt-4 space-y-3">
        {bookings.map((b) => (
          <BookingCard
            key={b.id}
            b={b}
            today={today}
            hasPendingReward={!!b.client_id && pendingRewardClients.has(b.client_id)}
            refOwner={b.ref_code ? refOwners.get(b.ref_code) : undefined}
            refDiscount={refDiscounts.get(b.phone)}
            paymentMethods={paymentMethods}
            coverCandidates={coverCandidatesFor(b)}
            linksReady={linksReady}
          />
        ))}
      </div>
    </div>
  );
}
