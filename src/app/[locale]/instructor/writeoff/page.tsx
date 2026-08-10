import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { phoneDigits } from "@/lib/phone";
import { minutesLeft, loadPaymentClaims } from "@/lib/subscriptions";
import { loadAllClients } from "@/lib/clients";
import { PaidBadge } from "@/components/cabinet/PaidBadge";
import { WriteOffForm } from "./WriteOffForm";
import { PageHeader } from "@/components/cabinet/PageHeader";

// Списание минут: поиск клиента → остаток крупно → внести каталку.

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

interface ClientRow {
  id: string;
  name: string;
  phone: string | null;
}

// Поиск по имени или номеру. Клиентов сотни — фильтруем в JS, как и в actions.
function matchClient(c: ClientRow, q: string): boolean {
  const qDigits = phoneDigits(q);
  if (qDigits.length >= 4 && phoneDigits(c.phone ?? "").includes(qDigits)) return true;
  return c.name.toLowerCase().includes(q.toLowerCase());
}

export default async function WriteOffPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; client?: string }>;
}) {
  const { q, client: clientId } = await searchParams;
  const supabase = await createClient();

  // ── Выбранный клиент: показываем остаток и форму списания ──
  if (clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("id, name, phone")
      .eq("id", clientId)
      .maybeSingle();

    if (!client) {
      return <p className="text-muted">Клиент не найден.</p>;
    }

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, total_minutes, expires_at, status, paid_at")
      .eq("client_id", client.id)
      .eq("status", "active")
      .order("sold_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Оплачен абонемент или нет — на списание не влияет (минуты клиенту всё
    // равно катать), но инструктор должен это видеть до того, как спишет
    // (пачка №10, п.4). Раньше экран об оплате молчал вовсе.
    const claims = sub ? await loadPaymentClaims(supabase, [sub.id]) : null;
    const claim = sub ? (claims?.get(sub.id) ?? null) : null;

    // Остаток считаем ровно тем же способом, что и writeOffAction при списании:
    // всего + корректировки админа − списания. Свой подсчёт здесь забывал про
    // корректировки, и экран показывал не ту цифру, которую примет сервер.
    const left = sub ? await minutesLeft(supabase, sub) : null;

    return (
      <div>
        <Link href="/instructor/writeoff" className="text-sm text-primary underline">
          ← К поиску
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{client.name}</h1>
        {client.phone && <p className="text-sm text-muted">{client.phone}</p>}

        {sub && left != null ? (
          <>
            {/* Остаток — крупно, это главное число экрана. */}
            <div className="mt-6 rounded-2xl border border-line bg-surface p-6 text-center">
              <p className="text-sm text-muted">Остаток на абонементе</p>
              <p className="mt-1 text-5xl font-bold text-primary">{left}</p>
              <p className="text-sm text-muted">минут</p>
              {sub.expires_at && (
                <p className="mt-2 text-xs text-muted">
                  Действует до {sub.expires_at.slice(0, 10)}
                </p>
              )}
            </div>
            {/* Абонемент не оплачен — списывать минуты можно (клиент катается,
                деньги догоняет админ), но молчать об этом нельзя. */}
            {!sub.paid_at && (
              <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700">
                <p className="font-bold">
                  {claim
                    ? "Оплата ещё не подтверждена админом"
                    : "Абонемент не оплачен"}
                </p>
                <p className="mt-1">
                  {claim
                    ? "Минуты списывайте как обычно — админ подтвердит оплату отдельно."
                    : "Минуты списать можно, но передайте админу, что за абонемент не заплатили."}
                </p>
                {claim?.note && (
                  <p className="mt-1 text-xs">Пометка: «{claim.note}»</p>
                )}
              </div>
            )}
            <div className="mt-6">
              <WriteOffForm clientId={client.id} clientName={client.name} left={left} />
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-2xl border border-line bg-surface p-6 text-center text-muted">
            У клиента нет активного абонемента.
            {/* Частый случай: абонемент клиент купил, а в CRM его не завели —
                деньги принял админ и забыл (пачка №10, п.5). Оформить нужно
                прямо сейчас, иначе списывать минуты не с чего. */}
            <p className="mt-2 text-sm">
              Если клиент говорит, что абонемент купил, — оформите его здесь и
              выберите «Оплату принял админ». Оплату подтвердит админ, а минуты
              списывайте сразу.
            </p>
            <Link href="/instructor/subscription" className="mt-2 block text-primary underline">
              Оформить абонемент
            </Link>
          </div>
        )}
      </div>
    );
  }

  // ── Поиск клиента ──
  let results: ClientRow[] = [];
  if (q && q.trim()) {
    // Постранично (lib/clients): при .limit(1000) поиск просто не находил бы
    // клиента, не попавшего в первую тысячу, и молчал «ничего не найдено».
    // created_at тянем, чтобы в выдаче первыми шли те, кто добавлен недавно.
    const { rows } = await loadAllClients<ClientRow & { created_at: string }>(
      supabase,
      "id, name, phone, created_at",
    );
    results = rows
      .filter((c) => matchClient(c, q.trim()))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 10);
  }

  // ── Клиенты с живым абонементом: показываем сразу, без поиска, чтобы
  // инструктору не приходилось каждый раз искать через строку. Остаток считаем
  // тем же minutesLeft, что и на экране самого списания.
  interface ActiveSubRow {
    id: string;
    total_minutes: number;
    expires_at: string | null;
    paid_at: string | null;
    client: { id: string; name: string; phone: string | null } | null;
  }
  const { data: activeSubsRaw } = await supabase
    .from("subscriptions")
    .select("id, total_minutes, expires_at, paid_at, client:clients(id, name, phone)")
    .eq("status", "active")
    .order("sold_at", { ascending: false });
  const activeSubs = (activeSubsRaw ?? []) as unknown as ActiveSubRow[];
  const listClaims = await loadPaymentClaims(
    supabase,
    activeSubs.map((s) => s.id),
  );
  const activeList = (
    await Promise.all(
      activeSubs.map(async (s) => ({
        client: s.client,
        expiresAt: s.expires_at,
        paidAt: s.paid_at,
        claim: listClaims.get(s.id)?.claim ?? null,
        left: await minutesLeft(supabase, s),
      })),
    )
  ).filter((r) => r.client && r.left > 0);

  return (
    <div>
      <PageHeader
        title="Списать минуты"
        hint="Найдите клиента по имени или телефону."
      />

      <form method="get" className="mt-6 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Имя или телефон"
          className={inputClass}
          autoFocus
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
        >
          Найти
        </button>
      </form>

      {/* Пока не ищем — сразу список тех, у кого есть что списывать. */}
      {!q && activeList.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-muted">С активным абонементом</h2>
          <div className="mt-3 space-y-3">
            {activeList.map((r) => (
              <Link
                key={r.client!.id}
                href={`/instructor/writeoff?client=${r.client!.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-primary"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold">{r.client!.name}</p>
                  {r.client!.phone && (
                    <p className="truncate text-sm text-muted">{r.client!.phone}</p>
                  )}
                  {/* Оплачен абонемент или нет — инструктор должен видеть до
                      того, как спишет минуты (пачка №9, пак 4). */}
                  <PaidBadge paidAt={r.paidAt} claim={r.claim} className="mt-1" />
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-primary">{r.left}</p>
                  <p className="text-xs text-muted">мин</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {q && (
        <div className="mt-6 space-y-3">
          {results.length === 0 && (
            <p className="text-center text-sm text-muted">Никого не нашли по «{q}».</p>
          )}
          {results.map((c) => (
            <Link
              key={c.id}
              href={`/instructor/writeoff?client=${c.id}`}
              className="block rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-primary"
            >
              <p className="font-bold">{c.name}</p>
              {c.phone && <p className="text-sm text-muted">{c.phone}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
