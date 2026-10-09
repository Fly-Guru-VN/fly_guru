// Экран «Рефералы» — общий для админа и СММщика (кабинет /smm), как «Клиенты».
// Заменил вкладку «Агенты» 09.10.2026: агентов больше нет, школу советуют
// члены клуба по своей ссылке (условия — lib/referralTerms).
import { redirect } from "next/navigation";
import { getActiveAppUser, isOffice } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { momentDay } from "@/lib/dates";
import { loadReferralsReport, type Referrer } from "@/lib/referralsReport";
import {
  FRIEND_SUBSCRIPTION_DISCOUNT,
  REFERRER_REWARD_BY_SERVICE,
} from "@/lib/referralTerms";
import { vnd } from "@/lib/stats";
import { PageHeader } from "@/components/cabinet/PageHeader";

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-primary tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function ReferrerCard({ r }: { r: Referrer }) {
  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">
            {r.member && <span title="Член клуба">⭐ </span>}
            {r.name}
          </p>
          <p className="truncate text-xs text-muted">
            {[r.phone, r.refCode ? `ссылка ${r.refCode}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="shrink-0 text-right text-sm">
          <p className="font-semibold">
            {r.friends.length} {r.friends.length === 1 ? "друг" : "друзей"}
          </p>
          <p className="text-xs text-muted tabular-nums">
            осталось {r.left} мин
          </p>
        </div>
        <span className="w-4 shrink-0 text-center text-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      <div className="border-t border-line/70 p-4 pt-3">
        <p className="text-sm text-muted">
          Начислено <span className="font-bold text-ink">{r.earned} мин</span> ·
          потрачено {r.spent} · осталось{" "}
          <span className="font-bold text-ink">{r.left}</span>
          {r.pending > 0 && ` · ждут оплаты абонемента ${r.pending}`}
        </p>
        {!r.member && (
          <p className="mt-1 text-xs text-muted">
            Сейчас не в клубе — по его ссылке новые награды не начисляются.
          </p>
        )}

        {r.friends.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Приглашённых нет.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line/70">
            {r.friends.map((f) => (
              <li key={f.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{f.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {[
                      `с ${momentDay(f.since)}`,
                      f.firstBuy ? `первое: ${f.firstBuy}` : "ещё ничего не купил",
                      f.phone,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-sm tabular-nums ${
                    f.minutes > 0 && !f.pending
                      ? "font-semibold text-accent-strong"
                      : "text-muted"
                  }`}
                >
                  {f.minutes > 0
                    ? f.pending
                      ? `+${f.minutes} ждёт оплаты`
                      : `+${f.minutes} мин`
                    : "без минут"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export async function ReferralsScreen() {
  // Читаем service-role клиентом (см. lib/referralsReport), поэтому роль
  // проверяем здесь сами, а не надеемся на RLS.
  const user = await getActiveAppUser();
  if (!user || !isOffice(user.role)) redirect("/login");

  const { referrers, totals } = await loadReferralsReport(createAdminClient());

  return (
    <div>
      <PageHeader
        title="Рефералы"
        hint="Члены клуба, которые приводят друзей по своей ссылке"
      />

      <p className="mt-3 rounded-2xl bg-accent/10 px-4 py-3 text-sm">
        Условия: новый друг по ссылке, награду решает его первая покупка —
        рефу взрослый тандем +{REFERRER_REWARD_BY_SERVICE["tandem-adult"]}, взрослое
        базовое +{REFERRER_REWARD_BY_SERVICE["basic-adult"]}, абонемент +
        {REFERRER_REWARD_BY_SERVICE.subscription} бонусных минут. Другу −
        {vnd(FRIEND_SUBSCRIPTION_DISCOUNT)}, если первой покупкой он берёт
        абонемент.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Пришло по ссылкам" value={totals.friends} sub={`купили: ${totals.bought}`} />
        <Tile
          label="Принесли минуты"
          value={totals.rewarded}
          sub={`из них абонемент сразу: ${totals.firstSubscription}`}
        />
        <Tile
          label="Минут начислено"
          value={totals.earned}
          sub={`потрачено ${totals.spent} · осталось ${totals.left}`}
        />
        <Tile label="Членов клуба" value={totals.members} sub="могут приглашать" />
      </div>

      {referrers.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          Пока никто не пришёл по ссылке члена клуба.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {referrers.map((r) => (
            <ReferrerCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}
