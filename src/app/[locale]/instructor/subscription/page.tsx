import { formatVnd } from "@/content/services";
import { getSiteServices, pickService } from "@/lib/services";
import { createClient } from "@/lib/supabase/server";
import { getActiveDict, embeddedName } from "@/lib/dictionaries";
import { EnteredBadge } from "@/components/cabinet/EnteredBadge";
import { PaidBadge } from "@/components/cabinet/PaidBadge";
import { SubscriptionForm, type SubscriptionPrefill } from "./SubscriptionForm";

// Продажа абонемента: 300 минут / 6 млн ₫, минуты живут 3 месяца.
// Создаёт subscription (sold_by = инструктор). Членом клуба клиент при этом
// НЕ становится — клуб запустим отдельно.

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const { booking: bookingId } = await searchParams;
  const sub = pickService(await getSiteServices(), "subscription");
  const paymentMethods = await getActiveDict(await createClient(), "payment_methods");

  // Пришли из заявки на абонемент («Продать абонемент» в списке записей):
  // тянем контакты клиента, чтобы форма открылась заполненной, а продажа
  // закрыла заявку (пачка №5, п.11).
  let prefill: SubscriptionPrefill | undefined;
  if (bookingId) {
    const supabase = await createClient();
    const { data: b } = await supabase
      .from("bookings")
      .select(
        "id, status, client_name, phone, telegram_username, payment_method_id, payment:payment_methods(name)",
      )
      .eq("id", bookingId)
      .maybeSingle();
    if (b && !["done", "cancelled", "archived"].includes(b.status)) {
      prefill = {
        bookingId: b.id,
        name: b.client_name,
        phone: b.phone,
        telegram: b.telegram_username,
        // Способ оплаты уже выбран админом в заявке — подставляем.
        paymentMethodId: b.payment_method_id,
        paymentMethodName: embeddedName(b.payment),
      };
    }
  }

  // Список проданных: минуты считаем батчем (списания + корректировки одним
  // запросом на всех), а не minutesLeft по каждой строке — иначе на полусотне
  // абонементов страница уходила бы в сотню запросов.
  const supabase = await createClient();
  interface SoldRow {
    id: string;
    total_minutes: number;
    price: number;
    paid_at: string | null;
    sold_at: string;
    clients: { name: string } | null;
    seller: { name: string } | null;
  }
  const { data: soldRaw } = await supabase
    .from("subscriptions")
    .select(
      "id, total_minutes, price, paid_at, sold_at, clients(name), seller:users!sold_by(name)",
    )
    .neq("status", "cancelled")
    .order("sold_at", { ascending: false })
    .limit(30);
  const soldRows = (soldRaw ?? []) as unknown as SoldRow[];
  const soldIds = soldRows.map((s) => s.id);

  const [usedRes, adjRes] = soldIds.length
    ? await Promise.all([
        supabase
          .from("sessions")
          .select("subscription_id, minutes_used")
          .in("subscription_id", soldIds),
        supabase
          .from("subscription_adjustments")
          .select("subscription_id, delta_minutes")
          .in("subscription_id", soldIds),
      ])
    : [{ data: [] }, { data: [] }];

  const usedBySub = new Map<string, number>();
  for (const r of usedRes.data ?? []) {
    const id = r.subscription_id as string;
    usedBySub.set(id, (usedBySub.get(id) ?? 0) + ((r.minutes_used as number) ?? 0));
  }
  const adjBySub = new Map<string, number>();
  for (const r of adjRes.data ?? []) {
    const id = r.subscription_id as string;
    adjBySub.set(id, (adjBySub.get(id) ?? 0) + ((r.delta_minutes as number) ?? 0));
  }

  const sold = soldRows.map((s) => ({
    id: s.id,
    clientName: s.clients?.name ?? null,
    sellerName: s.seller?.name ?? null,
    price: Number(s.price ?? 0),
    paidAt: s.paid_at,
    soldAt: s.sold_at,
    left: s.total_minutes + (adjBySub.get(s.id) ?? 0) - (usedBySub.get(s.id) ?? 0),
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold">Продать абонемент</h1>
      <p className="mt-1 text-sm text-muted">
        {sub.durationMin} минут за {formatVnd(sub.price)}. Минуты действуют 3 месяца.
        После оплаты 15% идут в общий котёл и делятся поровну между всеми
        инструкторами — неважно, кто продал.
      </p>
      {prefill && (
        <p className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">
          Заявка от <b>{prefill.name}</b> — продажа закроет её.
        </p>
      )}
      <div className="mt-6">
        <SubscriptionForm prefill={prefill} paymentMethods={paymentMethods} />
      </div>
      <p className="mt-4 text-xs text-muted">
        Если клиент ещё не обучен, первые 60 минут абонемента — обучающее занятие.
      </p>

      {/* Проданные абонементы школы. Продал — сразу видишь свою продажу в
          списке и убеждаешься, что она записалась; заодно видно, кому оплату
          ещё не отметили (пачка №9, пак 4). Список общий, а не «только мои»:
          15% с абонементов идут в общий котёл, и живой список полезен всем —
          RLS его инструктору и так отдаёт (subscriptions_select_staff). */}
      {sold.length > 0 && (
        <section className="mt-8">
          <h2 className="font-bold">Проданные абонементы</h2>
          <p className="mt-1 text-xs text-muted">
            Последние {sold.length}. Остаток минут — с учётом списаний и
            корректировок админа.
          </p>
          <div className="mt-3 space-y-3">
            {sold.map((s) => (
              <div key={s.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate font-bold">
                    {s.clientName ?? "Без клиента"}
                  </p>
                  <p className="shrink-0 text-sm font-bold text-primary">
                    {s.left} мин
                  </p>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {formatVnd(s.price)} · продал {s.sellerName ?? "—"}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <PaidBadge paidAt={s.paidAt} />
                  <EnteredBadge at={s.soldAt} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
