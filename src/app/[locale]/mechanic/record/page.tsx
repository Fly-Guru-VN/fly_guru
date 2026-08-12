import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { vnToday } from "@/lib/dates";
import { getActiveDict, getChannelNames } from "@/lib/dictionaries";
import { BookingCreateForm } from "../../admin/bookings/BookingCreateForm";
import { sortServicesByType } from "@/lib/serviceOrder";
import { PageHeader } from "@/components/cabinet/PageHeader";

export const metadata: Metadata = { title: "Механик · Записать клиента" };

// «Записать клиента» у механика — это ЗАЯВКА, а не сессия. Гость подошёл к
// нему на пляже, механик заводит запись, она уходит инструкторам в Telegram и
// в их раздел «Записи», а занятие оформляет тот, кто её принял. Форма и экшен
// — те же, что у админа (createBookingAction), чтобы поля и правила не
// разъехались; после сохранения экшен возвращает сюда с ?created=1.

export default async function MechanicRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;
  const supabase = await createClient();
  const today = vnToday();
  const [paymentMethods, channels] = await Promise.all([
    getActiveDict(supabase, "payment_methods"),
    getChannelNames(supabase),
  ]);

  // Абонемент из списка исключён намеренно: его продаёт инструктор отдельной
  // формой, иначе клиент не получит минуты и членство.
  const { data: serviceRows } = await supabase
    .from("services")
    .select("id, name, code, category")
    .eq("active", true)
    .neq("category", "subscription");
  // Порядок «по типажам» (lib/serviceOrder.ts).
  const services = sortServicesByType(serviceRows ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
  }));

  return (
    <div>
      <PageHeader
        title="Записать клиента"
        hint="Заявка уйдёт инструкторам. Занятие оформит тот, кто её примет."
      />

      {created && (
        <p className="mt-4 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
          ✅ Заявка создана — инструкторы её увидят.
        </p>
      )}

      <div className="mt-4">
        <BookingCreateForm
          services={services}
          today={today}
          paymentMethods={paymentMethods}
          channels={channels}
        />
      </div>
    </div>
  );
}
