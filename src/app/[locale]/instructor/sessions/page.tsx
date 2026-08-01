import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUser } from "@/lib/auth";
import { vnMonthToDate, vnPeriod, vnToday } from "@/lib/dates";
import { vnd } from "@/lib/stats";
import { getActiveDict } from "@/lib/dictionaries";
import { SaveForm } from "@/app/[locale]/admin/SaveForm";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { EnteredBadge } from "@/components/cabinet/EnteredBadge";
import { updateMySessionAction } from "../actions";
import { sortServicesByType } from "@/lib/serviceOrder";

// «Сессии» инструктора (пачка №9, пак 1). Инструктор оформляет записи весь
// день и до сих пор не видел, что именно записалось: список был только у
// админа, а в Статистике — суммы, а не строки. Здесь тот же список, что в
// админке, но без удаления: убрать чек из выручки — решение админа,
// инструктор правит содержимое записи, а не факт её существования.
//
// Пачка №11, п.2: список ОБЩИЙ — все записи школы, кто бы их ни внёс. Смена
// общая, и «а этого клиента вообще записали?» — вопрос про весь день, а не
// про свои строки. Править по-прежнему можно только свои: у чужой карточки
// вместо формы плашка (сервер это тоже проверяет, см. updateMySessionAction).

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

// Потолок выборки за период (у PostgREST он всё равно 1000). Упёрлись — честно
// говорим об этом под списком, а не молча показываем кусок месяца.
const SESSION_LIMIT = 1000;

function SessionCard({
  s,
  services,
  paymentMethods,
  canEdit,
}: {
  s: SessionRow;
  services: { id: string; name: string }[];
  paymentMethods: { id: string; name: string }[];
  canEdit: boolean;
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
          {/* Чем расплатились и когда запись попала в базу. Пустую оплату
              показываем жёлтым, а не прячем: «ничего не написано» читается
              как «такого поля нет». «Внесено» — это не дата занятия, а момент
              внесения: по нему инструктор и убеждается, что запись ушла. */}
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
            {/* Кто внёс запись: список общий, и без имени непонятно, чей это
                клиент и к кому идти с вопросом. */}
            <span className="inline-flex items-center gap-1 rounded-lg bg-line/40 px-2 py-0.5 text-xs font-bold text-muted">
              <span aria-hidden>👤</span>
              {s.instructor?.name ?? "инструктор не указан"}
            </span>
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

      {!canEdit ? (
        // Чужая запись: показываем, но не даём править. Ту же проверку делает
        // и сервер (updateMySessionAction) — плашка нужна, чтобы инструктор не
        // заполнял форму, которая всё равно упрётся в «это не ваша сессия».
        <div className="border-t border-line/70 p-4 pt-3">
          <p className="text-sm font-semibold text-muted">Редактирование недоступно</p>
          <p className="mt-1 text-xs text-muted">
            Запись внёс {s.instructor?.name ?? "другой инструктор"}. Поправить её
            может он сам или админ.
          </p>
        </div>
      ) : (
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
      )}
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
  // По умолчанию — с 1-го числа по сегодня (см. vnMonthToDate).
  const month = vnMonthToDate();
  const today = vnToday();

  // Период: обе даты включительно; по умолчанию — этот месяц по сегодня.
  const fromDay = DAY_RE.test(params.from ?? "") ? params.from! : month.fromDay;
  const toInclusive = DAY_RE.test(params.to ?? "")
    ? params.to!
    : month.lastDay;
  const range = vnPeriod(fromDay, toInclusive);

  const supabase = await createClient();
  const paymentMethods = await getActiveDict(supabase, "payment_methods");
  const [sessionsRes, servicesRes] = await Promise.all([
    // Читаем service-role клиентом: RLS отдаёт инструктору только его сессии
    // (плюс чужие списания минут — они нужны для остатка абонемента), а список
    // теперь общий. Наружу уходит ровно то, что и так видно у админа: клиент,
    // услуга, сумма, кто внёс. Правку сервер по-прежнему пускает только к
    // своим записям.
    createAdminClient()
      .from("sessions")
      .select(
        "id, date, amount, minutes_used, subscription_id, service_id, instructor_id, payment_method_id, note, created_at, clients(name), services(name), instructor:users!instructor_id(name), payment:payment_methods(name)",
      )
      .gte("date", range.fromDay)
      .lt("date", range.toDay)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      // 300 хватало, пока список был «только мои». Общий за месяц набирает
      // втрое больше строк, и на старом лимите свои же записи начала месяца
      // просто исчезали бы из списка (и из подсчёта «ваших»).
      .limit(SESSION_LIMIT),
    // Без категории subscription: абонемент — не сессия, у него своя форма
    // с минутами и оплатой (/instructor/subscription).
    supabase
      .from("services")
      .select("id, name, code, category")
      .eq("active", true)
      .neq("category", "subscription"),
  ]);

  const sessions = (sessionsRes.data ?? []) as unknown as SessionRow[];
  // Порядок «по типажам» (lib/serviceOrder.ts).
  const services = sortServicesByType(servicesRes.data ?? []);
  const total = sessions.reduce((sum, s) => sum + (s.amount ?? 0), 0);
  // Своё считаем отдельно: раньше единственная строка «N сессий · сумма» была
  // про меня, теперь она про всю школу — без второй строки инструктор читал бы
  // общую кассу как свою.
  const mine = sessions.filter((s) => s.instructor_id === user.id);
  const mineTotal = mine.reduce((sum, s) => sum + (s.amount ?? 0), 0);
  // Админ заходит в кабинет инструктора как суперюзер (см. requireRole) —
  // ему updateMySessionAction разрешает любую запись, значит и форму показываем.
  const isAdmin = user.role === "admin";

  return (
    <div>
      <h1 className="text-2xl font-bold">Сессии</h1>
      <p className="mt-1 text-sm text-muted">
        Все записи школы за период. Свои можно поправить прямо здесь — ошиблись
        в сумме, услуге или оплате. Чужие только видно. Удаляет сессии админ.
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
      {!isAdmin && (
        <p className="text-xs text-muted">
          из них ваших: {mine.length} · {vnd(mineTotal)}
        </p>
      )}
      {sessions.length === SESSION_LIMIT && (
        <p className="text-xs text-amber-600">
          Показаны последние {SESSION_LIMIT} записей периода — сузьте даты,
          чтобы увидеть остальные.
        </p>
      )}

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
            canEdit={isAdmin || s.instructor_id === user.id}
          />
        ))}
      </div>
    </div>
  );
}
