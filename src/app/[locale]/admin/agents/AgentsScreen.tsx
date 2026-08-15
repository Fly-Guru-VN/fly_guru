// Экран «Агенты» — общий для админа и СММщика (кабинет /smm): партнёры,
// реф-ссылки, награды и выплаты.
import { createClient } from "@/lib/supabase/server";
import { vnd } from "@/lib/stats";
import { deleteAgentPayoutAction, toggleAgentActiveAction } from "../actions";
import { AgentCreateForm } from "./AgentCreateForm";
import { AgentPayoutForm } from "./AgentPayoutForm";
import { CopyLink } from "../CopyLink";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { getActiveDict, type DictItem } from "@/lib/dictionaries";
import { dayLabel, vnToday } from "@/lib/dates";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";

// Агенты: партнёры с личной реф-ссылкой (гиды, отельеры). Приводят клиентов,
// получают фикс за каждого после выполненной услуги. Воронка на карточке:
// переходы по ссылке → клиенты → награды (ожидает / подтверждено).

interface AgentRow {
  id: string;
  ref_code: string;
  commission_fixed: number;
  active: boolean;
  user: { name: string; phone: string | null } | null;
}

interface AgentStats {
  visits: number;
  clients: number;
  bookedOnly: number; // заполнили заявку, но до оплаты не дошли (пак D, пункт 1)
  confirmedCount: number;
  confirmedSum: number;
  paidSum: number; // сколько денег агенту уже отдали (п.7)
}

const EMPTY_STATS: AgentStats = {
  visits: 0,
  clients: 0,
  bookedOnly: 0,
  confirmedCount: 0,
  confirmedSum: 0,
  paidSum: 0,
};

// Одна выплата в истории карточки.
interface PayoutRow {
  id: string;
  agent_id: string;
  amount: number;
  paid_on: string;
  comment: string | null;
  method: { name: string } | null;
}

function AgentCard({
  a,
  stats,
  payouts,
  methods,
  today,
}: {
  a: AgentRow;
  stats: AgentStats;
  payouts: PayoutRow[];
  methods: DictItem[];
  today: string;
}) {
  const name = a.user?.name ?? "агент";
  // К выплате: заработанное (подтверждённые награды) минус уже отданное.
  // Может уйти в минус — значит выплатили авансом; так и показываем.
  const due = stats.confirmedSum - stats.paidSum;
  return (
    <details
      className={`group rounded-2xl border border-line bg-surface ${a.active ? "" : "opacity-60"}`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">
            {name}{" "}
            <span className="font-normal text-muted">· {a.ref_code}</span>
          </p>
          <p className="truncate text-xs text-muted">
            {stats.visits} переходов · {stats.clients} клиентов ·{" "}
            {stats.confirmedCount} наград
          </p>
        </div>
        {/* Долг перед агентом виден, не раскрывая карточку — по нему админ и
            решает, кому сегодня отдавать деньги (п.7). */}
        {due > 0 && (
          <span className="whitespace-nowrap rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-600">
            к выплате {vnd(due)}
          </span>
        )}
        {!a.active && (
          <span className="rounded-full bg-line/60 px-2.5 py-1 text-[11px] font-semibold text-muted">
            Выключен
          </span>
        )}
        <span className="text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>

      <div className="space-y-3 border-t border-line/70 p-4 pt-3">
        <CopyLink path={`/r/${a.ref_code}`} />

        {/* Воронка: сколько людей открыли ссылку → сколько дошли до услуги. */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Переходы", value: String(stats.visits) },
            { label: "Клиенты", value: String(stats.clients) },
            { label: "Награды", value: String(stats.confirmedCount) },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-line/70 p-2">
              <p className="text-lg font-bold">{m.value}</p>
              <p className="text-[11px] text-muted">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Дошли до оплаты vs застряли на заявке (пак D, пункт 1) */}
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl border border-line/70 p-2">
            <p className="text-lg font-bold text-primary">{stats.confirmedCount}</p>
            <p className="text-[11px] text-muted">Оплатили</p>
          </div>
          <div className="rounded-xl border border-line/70 p-2">
            <p className="text-lg font-bold">{stats.bookedOnly}</p>
            <p className="text-[11px] text-muted">Только заявка</p>
          </div>
        </div>

        <div className="space-y-0.5 text-sm text-muted">
          {a.user?.phone && (
            <p>
              <a href={`tel:${a.user.phone}`} className="text-primary underline">
                {a.user.phone}
              </a>
            </p>
          )}
          {/* Строки «Ожидает» здесь больше нет: награда пишется сразу
              подтверждённой, и висящая рядом вторая сумма только путала
              (пачка №6, п.5). Деньги агента целиком — в блоке ниже. */}
          <p>
            Подтверждено:{" "}
            <span className="font-bold text-ink">{vnd(stats.confirmedSum)}</span>
            {stats.confirmedCount > 0 && ` (${stats.confirmedCount})`}
          </p>
          <p>Комиссия за клиента: {vnd(a.commission_fixed)}</p>
        </div>

        {/* Деньги: сколько заработал, сколько отдали, сколько должны (п.7).
            Выплата — только отметка «деньги переданы»: в расходы школы
            комиссия уже попала при начислении, второй раз не считаем. */}
        <div className="rounded-2xl border border-line/70 p-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <p className="text-muted">
              Начислено: <span className="font-bold text-ink">{vnd(stats.confirmedSum)}</span>
            </p>
            <p className="text-muted">
              Выплачено: <span className="font-bold text-ink">{vnd(stats.paidSum)}</span>
            </p>
            <p className="text-muted">
              К выплате:{" "}
              <span className={`font-bold ${due > 0 ? "text-amber-600" : "text-ink"}`}>
                {vnd(due)}
              </span>
            </p>
          </div>

          <AgentPayoutForm
            agentId={a.id}
            suggested={due > 0 ? due : 0}
            methods={methods}
            today={today}
          />

          {/* Отданные деньги — зелёными плашками, как «💵 Оплата» в сессиях и
              заявках. Раньше вся история была мелким серым по серому, и суммы
              в ней просто терялись. */}
          {payouts.length > 0 && (
            <div className="mt-3 border-t border-line/70 pt-2">
              <p className="text-xs font-semibold text-ink">История выплат</p>
              <ul className="mt-2 space-y-2">
                {payouts.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2"
                  >
                    <span aria-hidden className="text-sm leading-5">
                      💵
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-emerald-600">
                        {vnd(p.amount)}
                      </span>
                      <span className="block text-xs text-muted">
                        {dayLabel(p.paid_on)}
                        {p.method?.name ? ` · ${p.method.name}` : ""}
                        {p.comment ? ` · ${p.comment}` : ""}
                      </span>
                    </span>
                    <form action={deleteAgentPayoutAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmSubmit
                        message="Удалить эту выплату? Сумма «к выплате» пересчитается."
                        className="text-muted transition-colors hover:text-red-500"
                      >
                        ✕
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <form action={toggleAgentActiveAction}>
          <input type="hidden" name="id" value={a.id} />
          <input type="hidden" name="active" value={a.active ? "1" : "0"} />
          <button
            type="submit"
            className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
          >
            {a.active ? "Деактивировать" : "Включить обратно"}
          </button>
        </form>
      </div>
    </details>
  );
}

export async function AgentsScreen() {
  const supabase = await createClient();
  const today = vnToday();
  // Способы выплаты берём из общего справочника форматов оплаты.
  const methods = await getActiveDict(supabase, "payment_methods");

  const { data: agentsData } = await supabase
    .from("agents")
    .select("id, ref_code, commission_fixed, active, user:users!user_id(name, phone)");
  const agents = (agentsData ?? []) as unknown as AgentRow[];

  // Метрики тремя запросами на всех агентов сразу (не по одному на карточку),
  // агрегация в JS — на масштабе школы это дешевле и проще group by.
  const [visitsRes, clientsRes, rewardsRes, bookingsRes, payoutsRes] = await Promise.all([
    supabase.from("ref_visits").select("code").limit(100000),
    supabase
      .from("clients")
      .select("referrer_id")
      .eq("referrer_type", "agent"),
    supabase
      .from("referral_rewards")
      .select("referrer_id, amount, status")
      .eq("referrer_type", "agent"),
    // Заявки по агентским кодам: те, что «застряли» на форме (new/confirmed) и не
    // дошли до оплаты, — это «только заявка». Done уже стали сессией (= оплата,
    // видна в наградах), cancelled отброшены.
    supabase
      .from("bookings")
      .select("ref_code, status")
      .not("ref_code", "is", null)
      .in("status", ["new", "confirmed"]),
    // Выплаты агентам (п.7): свежие сверху, показываем последние в карточке.
    supabase
      .from("agent_payouts")
      .select("id, agent_id, amount, paid_on, comment, method:payment_methods!method_id(name)")
      .order("paid_on", { ascending: false })
      .limit(500),
  ]);

  const payoutsByAgent = new Map<string, PayoutRow[]>();
  for (const p of (payoutsRes.data ?? []) as unknown as PayoutRow[]) {
    payoutsByAgent.set(p.agent_id, [...(payoutsByAgent.get(p.agent_id) ?? []), p]);
  }

  const statsById = new Map<string, AgentStats>();
  const stat = (id: string): AgentStats => {
    let s = statsById.get(id);
    if (!s) {
      s = { ...EMPTY_STATS };
      statsById.set(id, s);
    }
    return s;
  };

  const idByCode = new Map(agents.map((a) => [a.ref_code, a.id]));
  for (const v of visitsRes.data ?? []) {
    const id = idByCode.get(v.code as string);
    if (id) stat(id).visits += 1;
  }
  for (const b of bookingsRes.data ?? []) {
    // Код заявки может быть и личным кодом инструктора — тогда idByCode его не
    // найдёт, и заявка справедливо не ляжет ни на какого агента.
    const id = idByCode.get(b.ref_code as string);
    if (id) stat(id).bookedOnly += 1;
  }
  for (const c of clientsRes.data ?? []) {
    if (c.referrer_id) stat(c.referrer_id as string).clients += 1;
  }
  for (const [agentId, list] of payoutsByAgent) {
    stat(agentId).paidSum = list.reduce((s, p) => s + (p.amount ?? 0), 0);
  }
  // Награда пишется сразу confirmed — занятие оформляют по факту оплаты, и
  // очереди «ожидает подтверждения» больше нет. Прочие статусы (если такая
  // строка когда-то заведётся руками) в счётчик приведённых не берём.
  for (const r of rewardsRes.data ?? []) {
    if (r.status !== "confirmed") continue;
    const s = stat(r.referrer_id as string);
    s.confirmedCount += 1;
    s.confirmedSum += (r.amount as number) ?? 0;
  }

  // Активные сверху (по имени), выключенные серым внизу.
  const sorted = [...agents].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      (a.user?.name ?? "").localeCompare(b.user?.name ?? "", "ru"),
  );

  return (
    <div>
      <PageHeader
        title="Агенты"
        hint="Партнёры с личной реф-ссылкой"
      />
      <PageNote>Награда агенту начисляется после выполненной услуги приведённого им клиента.</PageNote>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-3 font-bold">Новый агент</h2>
        <AgentCreateForm />
      </section>

      {sorted.length === 0 && (
        <p className="mt-4 text-sm text-muted">Агентов пока нет.</p>
      )}
      <div className="mt-4 space-y-3">
        {sorted.map((a) => (
          <AgentCard
            key={a.id}
            a={a}
            stats={statsById.get(a.id) ?? EMPTY_STATS}
            payouts={payoutsByAgent.get(a.id) ?? []}
            methods={methods}
            today={today}
          />
        ))}
      </div>
    </div>
  );
}
