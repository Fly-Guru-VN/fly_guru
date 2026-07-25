import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { loadAllClients } from "@/lib/clients";
import { vnCurrentMonth, vnPeriod, vnToday } from "@/lib/dates";
import { vnd } from "@/lib/stats";
import { deleteSessionAction, updateSessionAction } from "../actions";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { SaveForm } from "../SaveForm";
import { getActiveDict } from "@/lib/dictionaries";
import { SessionCreateForm } from "./SessionCreateForm";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { EnteredBadge } from "@/components/cabinet/EnteredBadge";

export const metadata: Metadata = { title: "Админка · Сессии" };

// Сессии школы: список за период + создание задним числом + правка.
// Сессия — факт занятия с чеком; списания минут абонемента тоже сессии
// (amount = 0), их минуты правятся только корректировками (подэтап 4.3).

interface SessionRow {
  id: string;
  date: string;
  amount: number;
  minutes_used: number | null;
  subscription_id: string | null;
  service_id: string | null;
  instructor_id: string | null;
  payment_method_id: string | null;
  note: string | null;
  created_at: string;
  clients: { name: string } | null;
  services: { name: string } | null;
  instructor: { name: string } | null;
  payment: { name: string } | null;
}

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

// То же поле, но естественной ширины — для фильтра периода (как в Статистике).
const dayInputClass =
  "rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function SessionCard({
  s,
  services,
  staff,
  paymentMethods,
}: {
  s: SessionRow;
  services: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  paymentMethods: { id: string; name: string }[];
}) {
  const isWriteoff = s.subscription_id !== null;

  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{s.clients?.name ?? "Без клиента"}</p>
          <p className="truncate text-xs text-muted">
            {[
              s.date,
              isWriteoff
                ? `списание ${s.minutes_used ?? 0} мин`
                : s.services?.name,
              s.instructor?.name,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {/* Чем расплатились. Босс сверяет кассу по этой строке, поэтому она
              отдельная и цветная, а не ещё одно слово в сером перечислении.
              У списания минут чека нет — там платить нечем. Пустую оплату
              показываем жёлтым, а не прячем: иначе «ничего не написано»
              читается как «такого поля нет», хотя данные просто не внесли. */}
          {/* Плашки в одну строку: чем платили и когда запись реально внесли.
              Второе — не дата занятия: сессию заводят и задним числом. */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {!isWriteoff && (
              <span
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold ${
                  s.payment
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-amber-500/10 text-amber-600"
                }`}
              >
                <span aria-hidden>💵</span>
                {s.payment?.name ?? "оплата не указана"}
              </span>
            )}
            <EnteredBadge at={s.created_at} />
          </div>
          {s.note && (
            <p className="mt-1 truncate text-xs italic text-muted">📝 {s.note}</p>
          )}
        </div>
        <span
          className={`text-sm font-bold ${isWriteoff ? "text-muted" : "text-primary"}`}
        >
          {isWriteoff ? "абонемент" : vnd(s.amount)}
        </span>
        <span className="text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>

      <SaveForm action={updateSessionAction} className="border-t border-line/70 p-4 pt-3">
        <input type="hidden" name="id" value={s.id} />
        {/* min-w-0 + items-end: нативный датапикер распирал свою колонку и
            наезжал на «Инструктора» (см. NATIVE_PICKER). */}
        <div className="grid grid-cols-2 items-end gap-2">
          <label className="min-w-0 text-xs text-muted">
            Дата
            <input
              type="date"
              name="date"
              defaultValue={s.date}
              className={`mt-1 ${NATIVE_PICKER} ${inputClass}`}
            />
          </label>
          <label className="min-w-0 text-xs text-muted">
            Инструктор
            {/* Пустое значение = «не трогать поле» (см. updateSessionAction).
                Подпись честно об этом говорит: раньше тут было «—», и выбор
                читался как «убрать инструктора», хотя сохранение его молча
                игнорировало. */}
            <select
              name="instructorId"
              defaultValue={s.instructor_id ?? ""}
              className={`mt-1 ${inputClass}`}
            >
              <option value="">— не менять</option>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          {!isWriteoff && (
            <>
              <label className="text-xs text-muted">
                Услуга
                <select
                  name="serviceId"
                  defaultValue={s.service_id ?? ""}
                  className={`mt-1 ${inputClass}`}
                >
                  <option value="">— не менять</option>
                  {services.map((sv) => (
                    <option key={sv.id} value={sv.id}>
                      {sv.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted">
                Сумма чека, ₫
                <input
                  type="text"
                  name="amount"
                  inputMode="numeric"
                  defaultValue={s.amount}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
            </>
          )}
        </div>
        {/* Формат оплаты правится здесь же: сессии, заведённые задним числом
            или закрытые до появления справочника, остаются без него, и
            дозаполнить их больше негде. */}
        {!isWriteoff && (
          <label className="mt-2 block text-xs text-muted">
            Формат оплаты
            <select
              name="paymentMethodId"
              defaultValue={s.payment_method_id ?? ""}
              className={`mt-1 ${inputClass}`}
            >
              <option value="">— не указан —</option>
              {paymentMethods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {/* Способ могли скрыть в справочнике уже после оплаты — без этой
                  строки select не нашёл бы своё значение и сохранение затёрло
                  бы его (та же защита, что в карточке заявки). */}
              {s.payment_method_id &&
                !paymentMethods.some((p) => p.id === s.payment_method_id) && (
                  <option value={s.payment_method_id}>
                    {s.payment?.name ?? "прежний способ"}
                  </option>
                )}
            </select>
          </label>
        )}
        <label className="mt-2 block text-xs text-muted">
          Примечание
          <textarea
            name="note"
            rows={2}
            defaultValue={s.note ?? ""}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        {isWriteoff && (
          <p className="mt-2 text-xs text-muted">
            Списание {s.minutes_used ?? 0} мин с абонемента. Минуты правятся
            корректировкой абонемента (с комментарием), не здесь.
          </p>
        )}
        <button
          type="submit"
          className="mt-3 rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
        >
          Сохранить
        </button>
      </SaveForm>

      <form action={deleteSessionAction} className="border-t border-line/70 p-4 pt-3">
        <input type="hidden" name="id" value={s.id} />
        <ConfirmSubmit
          message={
            isWriteoff
              ? `Удалить списание? ${s.minutes_used ?? 0} мин вернутся на абонемент клиента.`
              : "Удалить сессию? Чек уйдёт из выручки и ЗП инструктора за месяц."
          }
          className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-red-500 hover:text-red-500"
        >
          Удалить сессию
        </ConfirmSubmit>
      </form>
    </details>
  );
}

export default async function AdminSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const month = vnCurrentMonth();
  const today = vnToday();

  // Период: обе даты включительно; по умолчанию — текущий месяц.
  const fromDay = DAY_RE.test(params.from ?? "") ? params.from! : month.fromDay;
  const toInclusive = DAY_RE.test(params.to ?? "")
    ? params.to!
    : new Date(new Date(month.toDay).getTime() - 86400000).toISOString().slice(0, 10);
  const range = vnPeriod(fromDay, toInclusive);

  const supabase = await createClient();
  const paymentMethods = await getActiveDict(supabase, "payment_methods");
  const [sessionsRes, clientsRes, servicesRes, staffRes] = await Promise.all([
    supabase
      .from("sessions")
      .select(
        "id, date, amount, minutes_used, subscription_id, service_id, instructor_id, payment_method_id, note, created_at, clients(name), services(name), instructor:users!instructor_id(name), payment:payment_methods(name)",
      )
      .gte("date", range.fromDay)
      .lt("date", range.toDay)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
    // Полный список клиентов постранично (lib/clients): .limit(1000) молча
    // обрезал бы выпадающий список — клиента просто не было бы в выборе.
    loadAllClients<{ id: string; name: string; phone: string | null }>(
      supabase,
      "id, name, phone",
    ),
    // Без категории subscription: абонемент — не сессия, у него своя форма
    // с минутами, членством и тумблером оплаты (/admin/subscriptions).
    supabase
      .from("services")
      .select("id, name, price")
      .eq("active", true)
      .neq("category", "subscription")
      .order("name"),
    supabase.from("users").select("id, name").in("role", ["instructor", "admin"]).order("name"),
  ]);

  const sessions = (sessionsRes.data ?? []) as unknown as SessionRow[];
  // По алфавиту — см. комментарий в admin/members: загрузчик отдаёт по id.
  const clients = [...clientsRes.rows].sort((a, b) =>
    a.name.localeCompare(b.name, "ru"),
  );
  const services = (servicesRes.data ?? []).map((s) => ({
    ...s,
    price: Number(s.price ?? 0),
  }));
  const staff = staffRes.data ?? [];

  const total = sessions.reduce((sum, s) => sum + (s.amount ?? 0), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold">Сессии</h1>
      <p className="mt-1 text-sm text-muted">
        Все занятия школы. Инструктор забыл оформить — создайте сессию задним
        числом, она войдёт в выручку и его ЗП за месяц её даты.
      </p>

      {/* Создание — свёрнуто, чтобы не мешать просмотру */}
      <details className="mt-4 rounded-2xl border border-line bg-surface">
        <summary className="cursor-pointer list-none p-4 font-semibold text-primary [&::-webkit-details-marker]:hidden">
          + Создать сессию
        </summary>
        <div className="border-t border-line/70 p-4 pt-3">
          <SessionCreateForm
            clients={clients}
            services={services}
            staff={staff}
            today={today}
            paymentMethods={paymentMethods}
          />
        </div>
      </details>

      {/* Фильтр по периоду (GET — страница серверная). Раскладка как в
          Статистике: два компактных поля рядом, кнопка под ними во всю их
          ширину, весь блок прижат влево (w-fit). Поля БЕЗ w-full/flex-1 —
          растянутый нативный датапикер ломал ряд на телефоне. max={today}
          нужен не только по смыслу (занятий в будущем не бывает): без верхней
          границы Chrome резервирует в поле место под пятизначный год, и пара
          дат перестаёт влезать в узкий экран. */}
      <form className="mt-4 flex w-fit flex-col gap-3">
        <div className="flex items-end gap-2">
          <label className="flex flex-col items-start text-xs text-muted">
            С
            <input
              type="date"
              name="from"
              defaultValue={fromDay}
              max={today}
              className={`mt-1 ${NATIVE_PICKER} ${dayInputClass}`}
            />
          </label>
          <label className="flex flex-col items-start text-xs text-muted">
            По
            <input
              type="date"
              name="to"
              defaultValue={toInclusive}
              max={today}
              className={`mt-1 ${NATIVE_PICKER} ${dayInputClass}`}
            />
          </label>
        </div>
        <button
          type="submit"
          className="w-full rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
        >
          Показать
        </button>
      </form>

      <p className="mt-4 text-sm text-muted">
        {sessions.length} сессий ·{" "}
        <span className="font-bold text-ink">{vnd(total)}</span>
      </p>

      {sessions.length === 0 && (
        <p className="mt-4 text-sm text-muted">За этот период сессий нет.</p>
      )}
      <div className="mt-3 space-y-3">
        {sessions.map((s) => (
          <SessionCard
            key={s.id}
            s={s}
            services={services}
            staff={staff}
            paymentMethods={paymentMethods}
          />
        ))}
      </div>
    </div>
  );
}
