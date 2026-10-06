import { createClient } from "@/lib/supabase/server";
import { getAppUser, isAdminLike } from "@/lib/auth";
import { vnCurrentMonth, vnToday } from "@/lib/dates";
import { vnd } from "@/lib/stats";
import { getActiveDict, getChannelNames } from "@/lib/dictionaries";
import { sortServicesByType } from "@/lib/serviceOrder";
import { loadTours } from "@/lib/toursList";
import { SAFARI_PAY, TOUR_CATEGORY, TOUR_PAY, tourPayFor } from "@/lib/tours";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { RecordForm } from "../record/RecordForm";

// «Экскурсии и сафари» у инструктора — урезанная версия вкладки админки:
// записать свой тур (вёз — он сам, цена по прайсу) и посмотреть свои выезды
// за месяц с фиксом за каждый. Чужие туры, ручная цена, правка участников и
// удаление — у админа. Правила денег — lib/tours.

export default async function InstructorToursPage() {
  const supabase = await createClient();
  const user = await getAppUser();
  const today = vnToday();
  const month = vnCurrentMonth();

  const [servicesRes, paymentMethods, channels, tours] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, code, category, price")
      .eq("active", true)
      .eq("category", TOUR_CATEGORY),
    getActiveDict(supabase, "payment_methods"),
    getChannelNames(supabase),
    // Только свои: RLS инструктору и так отдаёт свои сессии, а начальник,
    // зашедший в кабинет инструктора, видел бы все.
    user ? loadTours(supabase, month, user.id) : Promise.resolve([]),
  ]);
  const services = sortServicesByType(servicesRes.data ?? []);
  // Фикс — полевому составу; у начальника в этом кабинете он всегда 0.
  const paid = user && !isAdminLike(user.role);
  const myPay = paid ? tours.reduce((s, t) => s + tourPayFor(t.services?.code), 0) : 0;

  return (
    <div className="max-w-xl">
      <PageHeader
        title="Экскурсии и сафари"
        hint={`За выезд: экскурсия ${vnd(TOUR_PAY)}, сафари ${vnd(SAFARI_PAY)}. Экскурсия от двух человек — по 3 000 000 ₫ с каждого.`}
      />

      <div className="mt-6">
        <RecordForm
          services={services}
          today={today}
          paymentMethods={paymentMethods}
          channels={channels}
        />
      </div>

      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-bold">Мои выезды · {month.label}</h2>
          {paid && <p className="shrink-0 font-bold text-primary">{vnd(myPay)}</p>}
        </div>
        {tours.length === 0 ? (
          <p className="mt-2 text-sm text-muted">В этом месяце туров пока нет.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tours.map((t) => (
              <li key={t.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate font-semibold">
                    {[t.clients?.name ?? "Без клиента", ...t.participants.map((p) => p.name)].join(", ")}
                  </p>
                  <p className="shrink-0 text-sm font-bold">{vnd(t.amount)}</p>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {[t.date, t.services?.name, `${t.people} чел.`, t.payment?.name ?? "оплата не указана"].join(" · ")}
                </p>
                {paid && (
                  <p className="mt-1 text-xs font-semibold text-primary">
                    мне за выезд: {vnd(tourPayFor(t.services?.code))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">
          Сумму, дату и оплату тура можно поправить во вкладке «Сессии». Участников
          добавляет и убирает админ.
        </p>
      </section>
    </div>
  );
}
