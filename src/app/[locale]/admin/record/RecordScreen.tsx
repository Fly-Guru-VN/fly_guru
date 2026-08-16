// Экран «Записать клиента» — общий для админа и СММщика (кабинет /smm):
// провести занятие и закрыть им заявку. Постит в общий createSessionAction,
// который сам вернёт человека в ленту ЕГО кабинета.
import { createClient } from "@/lib/supabase/server";
import { getAppUser } from "@/lib/auth";
import { vnToday } from "@/lib/dates";
import { getActiveDict, getChannelNames, embeddedName } from "@/lib/dictionaries";
import { RecordClientForm, type RecordPrefill } from "./RecordClientForm";
import { firstBasicTrainingByPhone } from "@/lib/agentReward";
import { sortServicesByType } from "@/lib/serviceOrder";
import { hiddenStaffIds, loadSessionStaff } from "@/lib/staff";
import { failIfReadError } from "@/lib/dbError";

// «Записать клиента» из кабинета админа: провести занятие на выбранного
// инструктора (по умолчанию — сам админ, он же записывает и иногда сам катает).
// Может закрыть заявку и учесть агентскую скидку/награду (?booking=id).
// Постит в общий createSessionAction (см. bookingId там).

// Заявка, из которой заполняется форма.
interface BookingPrefillRow {
  id: string;
  client_name: string;
  phone: string;
  service_id: string | null;
  ref_code: string | null;
  preferred_date: string | null;
  telegram_username: string | null;
  payment_method_id: string | null;
  city: string | null;
  src: string | null;
  payment: unknown;
  paid_on: string | null;
}

export async function RecordScreen({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const { booking: bookingId } = await searchParams;
  const supabase = await createClient();
  const admin = await getAppUser();
  const [paymentMethods, channels] = await Promise.all([
    getActiveDict(supabase, "payment_methods"),
    getChannelNames(supabase),
  ]);

  const [servicesRes, staffRes, hidden] = await Promise.all([
    // Без subscription: абонемент — не сессия (своя форма с минутами/членством).
    supabase
      .from("services")
      .select("id, name, price, code, category")
      .eq("active", true)
      .neq("category", "subscription"),
    loadSessionStaff(supabase),
    hiddenStaffIds(supabase), // уволенных не предлагаем (0036)
  ]);
  // Порядок «по типажам» (lib/serviceOrder.ts): базовое обучение первым,
  // похожие услуги рядом.
  const services = sortServicesByType(servicesRes.data ?? []).map((s) => ({
    ...s,
    price: Number(s.price ?? 0),
  }));
  const staff = staffRes.filter((u) => !hidden.has(u.id));

  const today = vnToday();

  let prefill: RecordPrefill | undefined;
  if (bookingId) {
    // paid_on (0042) в боевой базе есть — повтор запроса без неё убран
    // 16.08.2026: он подставлял в форму заявку без дня оплаты, и деньги
    // ложились в кассу не тем числом.
    const bookingRes = await supabase
      .from("bookings")
      .select(
        "id, client_name, phone, service_id, ref_code, preferred_date, telegram_username, payment_method_id, city, src, paid_on, payment:payment_methods(name)",
      )
      .eq("id", bookingId)
      .maybeSingle();
    failIfReadError(bookingRes.error, "не удалось прочитать заявку");
    const booking = bookingRes.data as unknown as BookingPrefillRow | null;
    if (booking) {
      // Дату занятия берём из заявки: админ уже договорился с клиентом на этот
      // день, и запись должна лечь именно туда, а не на «сегодня». Будущую дату
      // не подставляем — занятие ещё не состоялось, а поле не пускает вперёд.
      const day = booking.preferred_date as string | null;
      prefill = {
        bookingId: booking.id,
        name: booking.client_name,
        phone: booking.phone,
        serviceId: booking.service_id ?? undefined,
        refCode: booking.ref_code,
        telegram: booking.telegram_username,
        date: day && day <= today ? day : today,
        // Способ оплаты, проставленный в карточке заявки: спрашивать его тут
        // заново — то же действие второй раз.
        paymentMethodId: booking.payment_method_id,
        paymentMethodName: embeddedName(booking.payment),
        // Город и канал записи админ уже указал в заявке — спрашивать второй
        // раз незачем, но поменять можно (поля обычные).
        city: booking.city,
        channel: booking.src,
        // Дата оплаты из заявки: гость мог заплатить в прошлом месяце, и чек
        // должен лечь в кассу ТОГО месяца (0042).
        paidOn: booking.paid_on ?? null,
      };
      // Чей это код и положена ли гостю скидка — та же проверка, что делает
      // расчёт чека: скидку даёт только активный агент и только за первое
      // базовое обучение клиента.
      if (booking.ref_code) {
        const { data: agent } = await supabase
          .from("agents")
          .select("id")
          .eq("ref_code", booking.ref_code)
          .eq("active", true)
          .maybeSingle();
        const filled = prefill;
        filled.refIsAgent = Boolean(agent);
        if (filled.refIsAgent) {
          const known = await firstBasicTrainingByPhone(supabase, [booking.phone]);
          filled.refDiscount = known.get(booking.phone);
        }
      }
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Записать клиента</h1>
      <p className="mt-1 text-sm text-muted">
        Проведённое занятие. По умолчанию инструктор — вы; выберите другого, если
        катал он. Заявку из ленты можно закрыть этой же записью.
      </p>
      <div className="mt-6 max-w-xl">
        <RecordClientForm
          services={services}
          staff={staff}
          today={today}
          defaultInstructorId={admin?.id ?? staff[0]?.id ?? ""}
          paymentMethods={paymentMethods}
          channels={channels}
          prefill={prefill}
        />
      </div>
    </div>
  );
}
