// Правила подсчёта тарифа агента и история его зачислений «по формуле»
// (просьба начальника, 24.10.2026): чтобы с одного взгляда было понятно,
// сколько и за что получает агент. Один компонент на два места — карточку
// агента у админа и вкладку «Моя ссылка» в кабинете агента. showBase
// добавляет колонку «проценты школы с» — её видит только офис.
import {
  AGENT_PLANS,
  agentBaseCutFor,
  agentCommissionFor,
  agentRewardedCodes,
  applyRefDiscount,
  type AgentPlan,
} from "@/lib/agentTerms";
import type { Service } from "@/content/services";
import type { AgentRewardRow } from "@/lib/agentHistory";
import { dayLabel } from "@/lib/dates";
import { vnd } from "@/lib/stats";

export function AgentTermsTable({
  plan,
  services,
  showBase,
}: {
  plan: AgentPlan;
  /** Услуги сайта с живыми ценами (lib/services → getSiteServices). */
  services: Service[];
  showBase: boolean;
}) {
  const def = AGENT_PLANS[plan];
  const rows = agentRewardedCodes(plan).map((code) => {
    const service = services.find((s) => s.id === code);
    const price = service?.price ?? null;
    const check = price === null ? null : applyRefDiscount(price, code, true, plan);
    return {
      code,
      name: service?.name ?? code,
      price,
      check,
      reward: agentCommissionFor(code, check, plan),
      base: check === null ? null : Math.max(0, check - agentBaseCutFor(code, check, plan)),
    };
  });

  return (
    <div>
      <p className="text-sm font-semibold text-primary">{def.label}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[300px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line/70">
              <th className="py-1.5 pr-2 font-medium">Услуга</th>
              <th className="py-1.5 pr-2 font-medium">Клиент платит</th>
              <th className="py-1.5 pr-2 font-medium">Агенту</th>
              {showBase && <th className="py-1.5 font-medium">% школы с</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-b border-line/50 align-top last:border-0">
                <td className="py-2 pr-2">{r.name}</td>
                <td className="py-2 pr-2 tabular-nums">
                  {r.check === null ? "—" : vnd(r.check)}
                  {r.price !== null && r.check !== null && r.price > r.check && (
                    <span className="block text-xs text-muted line-through">{vnd(r.price)}</span>
                  )}
                </td>
                <td className="py-2 pr-2 font-semibold tabular-nums text-accent-strong">
                  {vnd(r.reward)}
                </td>
                {showBase && (
                  <td className="py-2 tabular-nums">{r.base === null ? "—" : vnd(r.base)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-2 space-y-1 text-xs text-muted">
        <li>
          {def.newClientsOnly
            ? "Только за нового клиента — если человек раньше ничего у нас не покупал. Платим один раз, за первую покупку."
            : "Только за первое обучение гостя: повторные занятия того же человека не оплачиваются."}
        </li>
        {agentRewardedCodes(plan).includes("subscription") && (
          <li>За абонемент — эта сумма, даже если цену абонемента поменяли руками.</li>
        )}
        {showBase && (
          <li>
            35% Marina, 15% инструкторам и 2% CRM считаются с колонки «% школы с»: с
            занятия — чек минус агенту
            {agentRewardedCodes(plan).includes("subscription") &&
              `, с абонемента — чек минус ${vnd(agentBaseCutFor("subscription", null, plan))}`}
            .
          </li>
        )}
        <li>Остальные услуги по ссылке — по обычной цене и без награды.</li>
      </ul>
    </div>
  );
}

export function AgentRewardHistory({
  rows,
  showBase,
}: {
  rows: AgentRewardRow[];
  showBase: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">Начислений пока нет.</p>;
  }
  return (
    <ul className="divide-y divide-line/60">
      {rows.map((r) => (
        <li key={r.id} className="py-2 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate font-medium">
              {r.clientName} · {r.what}
            </span>
            <span
              className={`shrink-0 font-bold tabular-nums ${r.pending ? "text-muted" : "text-accent-strong"}`}
            >
              +{vnd(r.reward)}
            </span>
          </div>
          <p className="text-xs text-muted">
            {[
              r.day ? dayLabel(r.day) : null,
              r.check !== null ? `клиент заплатил ${vnd(r.check)} → агенту ${vnd(r.reward)}` : null,
              showBase && r.base !== null ? `% школы с ${vnd(r.base)}` : null,
              r.pending ? "ждёт оплаты абонемента" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </li>
      ))}
    </ul>
  );
}
