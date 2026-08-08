import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAppUser } from "@/lib/auth";
import { vnToday } from "@/lib/dates";
import { acceptBookingAction, declineBookingAction } from "../actions";

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

const actionButton =
  "inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-colors";

export default async function InstructorBookingsPage() {
  const supabase = await createClient();
  const today = vnToday();

  // Профиль и список записей не зависят друг от друга — грузим параллельно,
  // а не по очереди (каждый поход к базе в другом регионе стоит ~200 мс).
  // Колонка paid добавлена в 0036: пока миграция не накатана, читаем без неё —
  // иначе лента записей у инструктора осталась бы пустой.
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

  const [user, first] = await Promise.all([
    getAppUser(),
    bookingsQuery(`${cols}, paid`),
  ]);
  const res = first.error ? await bookingsQuery(cols) : first;
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const bookings = (res.data ?? []) as unknown as BookingRow[];

  return (
    <div>
      {/* Шапка: заголовок слева, оранжевая кнопка записи справа (пачка №6,
          п.2). На телефоне кнопка занимает 40% строки и до неё дотягивается
          большой палец; items-stretch тянет заголовок на высоту кнопки, чтобы
          они читались одной строкой. Пояснительный текст убран — инструкторы
          и так знают, что делать с записью. */}
      <div className="flex items-stretch justify-between gap-3">
        <h1 className="flex items-center text-3xl font-bold">Записи</h1>
        <Link
          href="/instructor/record"
          className="flex w-2/5 shrink-0 items-center justify-center rounded-full bg-accent px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-accent-strong sm:w-auto sm:px-7"
        >
          Записать
        </Link>
      </div>

      {bookings.length === 0 && (
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 text-center text-muted">
          Активных записей нет. 🌊
        </div>
      )}

      <div className="mt-6 space-y-3">
        {bookings.map((b) => {
          const mine = b.accepted_by === user.id;

          return (
            <div
              key={b.id}
              className={`rounded-2xl border bg-surface p-4 ${
                b.pinned ? "border-accent" : "border-line"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">
                    {b.pinned && <span title="Закреплена админом">📌 </span>}
                    {b.client_name}
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
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
