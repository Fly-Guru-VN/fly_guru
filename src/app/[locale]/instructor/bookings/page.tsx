import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAppUser } from "@/lib/auth";
import { vnToday } from "@/lib/dates";
import { acceptBookingAction, coverBookingAction, declineBookingAction } from "../actions";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { vnd } from "@/lib/stats";

// «Записи»: заявки, которые админ подтвердил (созвонился, внёс время/возраст/
// вес). Закреплённые админом — сверху. Любой инструктор может принять запись;
// после того как её приняли, оформить занятие может ЛЮБОЙ инструктор (мало ли,
// катает другой) — «Принял: X» лишь показывает, кто координирует. Вернуть
// запись в общий пул кнопкой «Отказаться» может только принявший.

interface BookingRow {
  id: string;
  client_name: string;
  phone: string;
  preferred_date: string | null;
  scheduled_time: string | null;
  age: number | null;
  weight: number | null;
  pinned: boolean;
  internal_note: string | null;
  city: string | null;
  paid: boolean | null; // деньги уже получены до занятия (0036)
  accepted_by: string | null;
  services: { name: string; category: string } | null;
  accepted: { name: string } | null;
}

// Занятие, которым можно закрыть заявку-спутника (0038).
interface SessionOption {
  id: string;
  date: string;
  amount: number | null;
  clients: { name: string } | null;
  services: { name: string } | null;
  instructor: { name: string } | null;
}

const actionButton =
  "inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-colors";

export default async function InstructorBookingsPage() {
  const supabase = await createClient();
  const today = vnToday();

  // Профиль и список записей не зависят друг от друга — грузим параллельно,
  // а не по очереди (каждый поход к базе в другом регионе стоит ~200 мс).
  const cols =
    "id, client_name, phone, preferred_date, scheduled_time, age, weight, pinned, internal_note, city, accepted_by, services(name, category), accepted:users!accepted_by(name)";
  const bookingsQuery = (columns: string) =>
    supabase
      .from("bookings")
      .select(columns)
      .eq("status", "confirmed")
      .order("pinned", { ascending: false })
      .order("preferred_date", { ascending: true, nullsFirst: false })
      .limit(50);

  // Занятия последней недели — из них выбирают, в каком уже учтён второй
  // человек парной записи. Список общий, как и вкладка «Сессии» (пачка №11):
  // катать мог напарник, а закрывать заявку — тот, кто сейчас на пляже.
  // Поэтому service_role: своя RLS отдаёт инструктору только его сессии.
  const coverFrom = new Date(`${today}T00:00:00Z`);
  coverFrom.setUTCDate(coverFrom.getUTCDate() - 7);

  const [user, first, recent] = await Promise.all([
    getAppUser(),
    // session_id в первом запросе — заодно проверка, накатана ли 0038: пока
    // колонки нет, привязывать заявку к занятию нечем, и кнопку показывать
    // незачем (нажатие всё равно ничего бы не сделало).
    bookingsQuery(`${cols}, paid, session_id`),
    createAdminClient()
      .from("sessions")
      .select("id, date, amount, clients(name), services(name), instructor:users!instructor_id(name)")
      .gte("date", coverFrom.toISOString().slice(0, 10))
      .order("date", { ascending: false })
      .limit(100),
  ]);
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const bookings = (first.data ?? []) as unknown as BookingRow[];
  const recentSessions = (recent.data ?? []) as unknown as SessionOption[];
  const freeCount = bookings.filter((b) => !b.accepted_by).length;

  // Занятия, соседние по дате с заявкой: клиента учитывают в занятии того же
  // дня, а не месячной давности.
  const coverCandidatesFor = (b: BookingRow): SessionOption[] => {
    const anchor = b.preferred_date ?? today;
    const from = new Date(`${anchor}T00:00:00Z`);
    const to = new Date(from);
    from.setUTCDate(from.getUTCDate() - 3);
    to.setUTCDate(to.getUTCDate() + 3);
    const fromDay = from.toISOString().slice(0, 10);
    const toDay = to.toISOString().slice(0, 10);
    return recentSessions.filter((s) => s.date >= fromDay && s.date <= toDay);
  };

  return (
    <div>
      {/* Шапка как во всех кабинетах: заголовок с красным счётчиком свободных
          записей и оранжевая кнопка записи справа. На телефоне кнопка занимает
          40% строки и до неё дотягивается большой палец. Пояснительный текст
          не нужен — инструкторы и так знают, что делать с записью. */}
      <PageHeader
        title="Записи"
        badge={freeCount}
        action={
          <Link
            href="/instructor/record"
            className="flex w-2/5 shrink-0 items-center justify-center rounded-full bg-accent px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-accent-strong sm:w-auto sm:px-7"
          >
            Записать
          </Link>
        }
      />

      {bookings.length === 0 && (
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 text-center text-muted">
          Активных записей нет. 🌊
        </div>
      )}

      <div className="mt-6 space-y-3">
        {bookings.map((b) => {
          const mine = b.accepted_by === user.id;
          // Свободная — ещё никем не принята. Раньше такая карточка ничем не
          // отличалась от уже принятой: рамка выделяла только закреплённые
          // админом, и свободные записи висели незамеченными.
          const free = !b.accepted_by;

          return (
            <div
              key={b.id}
              className={`rounded-2xl border bg-surface p-4 ${
                b.pinned
                  ? "border-accent"
                  : free
                    ? "border-red-500/40 ring-1 ring-red-500/15"
                    : "border-line"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-bold">
                    {b.pinned && <span title="Закреплена админом">📌 </span>}
                    <span className="min-w-0 truncate">{b.client_name}</span>
                    {free && (
                      <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                        свободна
                      </span>
                    )}
                  </p>
                  <a href={`tel:${b.phone}`} className="text-sm text-primary underline">
                    {b.phone}
                  </a>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-primary">
                    {b.scheduled_time ?? "время?"}
                  </p>
                  {b.preferred_date && (
                    <p className="text-xs text-muted">
                      {b.preferred_date === today ? "Сегодня" : b.preferred_date}
                    </p>
                  )}
                </div>
              </div>

              {/* Услуга — отдельной крупной строкой: инструктору важнее всего
                  знать, что именно он катает, а раньше она терялась мелким
                  серым текстом рядом с возрастом (prompts 3, п.2). */}
              {b.services?.name && (
                <p className="mt-2 text-base font-semibold text-ink">{b.services.name}</p>
              )}

              <div className="mt-1 space-y-0.5 text-sm text-muted">
                <p>
                  {b.age != null && <>Возраст: {b.age}</>}
                  {b.age != null && b.weight != null && " · "}
                  {b.weight != null && <>Вес: {b.weight} кг</>}
                </p>
                {/* Город гостя: у ручных заявок его теперь спрашивают всегда,
                    у заявок с сайта и у старых строки не будет. */}
                {b.city && <p>Город: {b.city}</p>}
                {b.internal_note && <p className="italic">{b.internal_note}</p>}
              </div>

              {/* Деньги уже у школы (0036): гость перевёл их при переписке.
                  Плашкой, а не строчкой в общем списке, — чтобы на пляже её
                  было видно сразу и никто не попросил заплатить второй раз. */}
              {b.paid && (
                <p className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-600">
                  <span aria-hidden>✅</span>
                  Клиент уже оплатил
                </p>
              )}

              {!b.accepted_by && (
                <form action={acceptBookingAction} className="mt-3">
                  <input type="hidden" name="id" value={b.id} />
                  <button
                    type="submit"
                    className={`${actionButton} bg-primary text-white hover:opacity-90`}
                  >
                    Принять
                  </button>
                </form>
              )}

              {/* Принята — оформить может любой инструктор. «Отказаться»
                  (вернуть в общий пул) оставляем только принявшему. */}
              {b.accepted_by && (
                <>
                  <div className="mt-3 flex gap-2">
                    <Link
                      href={
                        b.services?.category === "subscription"
                          ? `/instructor/subscription?booking=${b.id}`
                          : `/instructor/record?booking=${b.id}`
                      }
                      className={`${actionButton} bg-accent text-white hover:bg-accent-strong`}
                    >
                      {b.services?.category === "subscription" ? "Продать абонемент" : "Записать клиента"}
                    </Link>
                    {mine && (
                      <form action={declineBookingAction} className="shrink-0">
                        <input type="hidden" name="id" value={b.id} />
                        <button
                          type="submit"
                          className="rounded-full border border-line px-4 py-3 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
                        >
                          Отказаться
                        </button>
                      </form>
                    )}
                  </div>

                  <p className="mt-2 text-sm font-semibold text-muted">
                    Принял: {mine ? "вы" : b.accepted?.name ?? "другой инструктор"}
                  </p>

                  {/* Второй человек парной записи. Мама записывает себя и
                      дочку двумя заявками, а занятие одно — парное обучение за
                      3,5 млн. Записать вторую как отдельное занятие нельзя:
                      это второй чек в выручке и вторые 15%. Раньше такая
                      заявка просто висела в ленте до админа, и человек,
                      который реально катался, числился отказом.
                      Свёрнуто: нужно это редко. */}
                  {coverCandidatesFor(b).length > 0 && (
                    <details className="mt-3 rounded-xl border border-line bg-line/10 p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-muted">
                        Клиент уже учтён в другом занятии
                      </summary>
                      <form action={coverBookingAction} className="mt-2 space-y-2">
                        <input type="hidden" name="id" value={b.id} />
                        <select
                          name="sessionId"
                          required
                          className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-sm outline-none focus:border-primary"
                        >
                          {coverCandidatesFor(b).map((s) => (
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
                        <button
                          type="submit"
                          className={`${actionButton} border border-line text-muted hover:border-primary hover:text-primary`}
                        >
                          Закрыть заявку этим занятием
                        </button>
                      </form>
                      <p className="mt-2 text-xs text-muted">
                        Заявка станет выполненной, второй раз деньги не
                        посчитаются.
                      </p>
                    </details>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
