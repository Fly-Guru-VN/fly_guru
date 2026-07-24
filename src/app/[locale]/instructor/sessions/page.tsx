import { createClient } from "@/lib/supabase/server";
import { getAppUser } from "@/lib/auth";
import { vnCurrentMonth, vnPeriod, vnShiftDays, vnToday } from "@/lib/dates";
import { vnd } from "@/lib/stats";
import { getActiveDict } from "@/lib/dictionaries";
import { SaveForm } from "@/app/[locale]/admin/SaveForm";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { updateMySessionAction } from "../actions";

// «Сессии» инструктора (пачка №9, пак 1). Инструктор оформляет записи весь
// день и до сих пор не видел, что именно записалось: список был только у
// админа, а в Статистике — суммы, а не строки. Здесь тот же список, что в
// админке, но строго свой и без удаления: убрать чек из выручки — решение
// админа, инструктор правит содержимое записи, а не факт её существования.

interface SessionRow {
  id: string;
  date: string;
  amount: number;
  minutes_used: number | null;
  subscription_id: string | null;
  service_id: string | null;
  payment_method_id: string | null;
  clients: { name: string } | null;
  services: { name: string } | null;
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
  paymentMethods,
}: {
  s: SessionRow;
  services: { id: string; name: string }[];
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
              isWriteoff ? `списание ${s.minutes_used ?? 0} мин` : s.services?.name,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {/* Чем расплатились — отдельной цветной строкой, как в админке.
              Пустую оплату показываем жёлтым, а не прячем: «ничего не
              написано» читается как «такого поля нет». */}
          {!isWriteoff && (
            <p
              className={`mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold ${
                s.payment
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-amber-500/10 text-amber-600"
              }`}
            >
              <span aria-hidden>💵</span>
              {s.payment?.name ?? "оплата не указана"}
            </p>
          )}
        </div>
        <span
          className={`text-sm font-bold ${isWriteoff ? "text-muted" : "text-primary"}`}
        >
          {isWriteoff ? "абонемент" : vnd(s.amount)}
        </span>
        <span className="text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>

      <SaveForm action={updateMySessionAction} className="border-t border-line/70 p-4 pt-3">
        <input type="hidden" name="id" value={s.id} />
        {/* min-w-0 + items-end: нативный датапикер распирает свою колонку
            и наезжает на соседнюю (см. NATIVE_PICKER). */}
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
          {!isWriteoff && (
            <>
              <label className="text-xs text-muted">
                Услуга
                {/* Пустое значение = «не трогать поле» (см. updateMySessionAction).
                    Подпись честно об этом говорит: «—» читалось бы как «убрать». */}
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
                  бы его. */}
              {s.payment_method_id &&
                !paymentMethods.some((p) => p.id === s.payment_method_id) && (
                  <option value={s.payment_method_id}>
                    {s.payment?.name ?? "прежний способ"}
                  </option>
                )}
            </select>
          </label>
        )}
        {isWriteoff && (
          <p className="mt-2 text-xs text-muted">
            Списание {s.minutes_used ?? 0} мин с абонемента. Минуты правит админ
            корректировкой абонемента, не здесь.
          </p>
        )}
        <button
          type="submit"
          className="mt-3 rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
        >
          Сохранить
        </button>
      </SaveForm>
    </details>
  );
}

export default async function InstructorSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const params = await searchParams;
  const month = vnCurrentMonth();
  const today = vnToday();

  // Период: обе даты включительно; по умолчанию — текущий месяц.
  const fromDay = DAY_RE.test(params.from ?? "") ? params.from! : month.fromDay;
  const toInclusive = DAY_RE.test(params.to ?? "")
    ? params.to!
    : vnShiftDays(month.toDay, -1);
  const range = vnPeriod(fromDay, toInclusive);

  const supabase = await createClient();
  const paymentMethods = await getActiveDict(supabase, "payment_methods");
  const [sessionsRes, servicesRes] = await Promise.all([
    // .eq("instructor_id") обязателен: RLS отдаёт инструктору ещё и ЧУЖИЕ
    // списания минут (они нужны для остатка абонемента при списании), а в
    // своём списке им делать нечего.
    supabase
      .from("sessions")
      .select(
        "id, date, amount, minutes_used, subscription_id, service_id, payment_method_id, clients(name), services(name), payment:payment_methods(name)",
      )
      .eq("instructor_id", user.id)
      .gte("date", range.fromDay)
      .lt("date", range.toDay)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
    // Без категории subscription: абонемент — не сессия, у него своя форма
    // с минутами и оплатой (/instructor/subscription).
    supabase
      .from("services")
      .select("id, name")
      .eq("active", true)
      .neq("category", "subscription")
      .order("name"),
  ]);

  const sessions = (sessionsRes.data ?? []) as unknown as SessionRow[];
  const services = servicesRes.data ?? [];
  const total = sessions.reduce((sum, s) => sum + (s.amount ?? 0), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold">Сессии</h1>
      <p className="mt-1 text-sm text-muted">
        Все ваши записи за период. Ошиблись в сумме, услуге или оплате —
        поправьте прямо здесь. Удаляет сессии админ.
      </p>

      {/* Фильтр периода — раскладка как в Статистике: два компактных поля
          рядом, кнопка под ними во всю их ширину, блок прижат влево (w-fit).
          Поля БЕЗ w-full — растянутый нативный датапикер ломает ряд на
          телефоне. max={today} нужен не только по смыслу: без верхней границы
          Chrome резервирует место под пятизначный год. */}
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
        {sessions.length} сессий · <span className="font-bold text-ink">{vnd(total)}</span>
      </p>

      {sessions.length === 0 && (
        <p className="mt-4 text-sm text-muted">За этот период записей нет.</p>
      )}
      <div className="mt-3 space-y-3">
        {sessions.map((s) => (
          <SessionCard
            key={s.id}
            s={s}
            services={services}
            paymentMethods={paymentMethods}
          />
        ))}
      </div>
    </div>
  );
}
