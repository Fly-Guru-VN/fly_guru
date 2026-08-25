import type { Metadata } from "next";
import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAgentProfile } from "@/lib/agentCabinet";
import { AGENT_PLANS } from "@/lib/agentTerms";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";
import { CopyLink } from "../../admin/CopyLink";
import { NoAgentProfile } from "../NoAgentProfile";

export const metadata: Metadata = { title: "Агент · Моя ссылка" };

// Ссылка агента, её QR и условия ЕГО тарифа словами.
//
// Условия стоят здесь не для красоты: у разных агентов они разные (0046), и
// «сколько скидка гостю» — первое, что агент говорит человеку вслух. Пока их
// нигде не было, агенты называли суммы по памяти, а память у всех своя.
export default async function AgentLinkPage() {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const supabase = await createClient();
  const profile = await getAgentProfile(supabase, user.id);
  if (!profile) return <NoAgentProfile />;

  const plan = AGENT_PLANS[profile.plan];

  return (
    <div>
      <PageHeader title="Моя ссылка" hint="По ней гость получает скидку" />
      <PageNote>
        Отправляйте гостю ссылку или показывайте QR. Запись, сделанная по ней,
        закрепляется за вами автоматически — говорить об этом инструктору не
        нужно.
      </PageNote>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <CopyLink path={`/r/${profile.refCode}`} />

        <div className="mt-4 flex items-center gap-3">
          {/* Обычный <img>, а не next/image: картинку рисует сервер на лету
              (api/agent-qr), оптимизировать в ней нечего. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/agent-qr/${profile.refCode}`}
            alt="QR-код моей ссылки"
            width={112}
            height={112}
            className="h-28 w-28 shrink-0 rounded-xl border border-line bg-white p-1"
          />
          <div className="min-w-0 text-sm text-muted">
            <p>QR ведёт на ту же страницу, что и ссылка.</p>
            <a
              href={`/api/agent-qr/${profile.refCode}?download=1`}
              download={`flyguru-${profile.refCode}.png`}
              className="mt-2 inline-block rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
            >
              Скачать QR
            </a>
          </div>
        </div>

        {!profile.active && (
          <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm font-semibold text-amber-700">
            Ссылка выключена: гость по ней записаться не сможет. Напишите
            начальнику, если это ошибка.
          </p>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Мои условия</h2>
        <p className="mt-1 text-sm font-semibold text-primary">{plan.label}</p>
        <p className="mt-1 text-sm text-muted">{plan.note}</p>
        <p className="mt-3 text-sm text-muted">
          Скидка и награда действуют на обучение — базовое и парное. На прокат,
          тандем и экскурсии ссылка работает, но по обычной цене и без награды.
        </p>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Когда я получу деньги</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-muted">
          <li>
            <b className="text-ink">1.</b> Гость переходит по ссылке и
            записывается.
          </li>
          <li>
            <b className="text-ink">2.</b> Он приезжает и оплачивает занятие —
            в этот момент вам начисляется награда.
          </li>
          <li>
            <b className="text-ink">3.</b> Начальник отдаёт деньги, и выплата
            появляется во вкладке «Выплаты».
          </li>
        </ul>
        <p className="mt-3 text-sm text-muted">
          Пока гость только записался, награды нет: школа платит за состоявшееся
          занятие.
        </p>
      </section>
    </div>
  );
}
