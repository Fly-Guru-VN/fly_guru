import type { Metadata } from "next";
import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveServices } from "@/lib/services";
import { getAgentProfile } from "@/lib/agentCabinet";
import { vnToday } from "@/lib/dates";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";
import { NoAgentProfile } from "../NoAgentProfile";
import { RecordGuestForm } from "./RecordGuestForm";

export const metadata: Metadata = { title: "Агент · Записать гостя" };

// «Записать гостя»: заявка от имени агента, с его реф-кодом.
//
// Пока этого экрана не было, гость, пришедший «от Хунга» на словах, оседал в
// CRM без кода — скидки ему не давали, награду агенту не начисляли. Теперь
// агент заводит заявку сам, и она сразу закреплена за ним.
export default async function AgentRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const supabase = await createClient();
  const profile = await getAgentProfile(supabase, user.id);
  if (!profile) return <NoAgentProfile />;

  const { done } = await searchParams;
  const services = await getActiveServices();

  return (
    <div>
      <PageHeader
        title="Записать гостя"
        hint="Заявка сразу закрепится за вами"
      />

      {/* После отправки экшен возвращает сюда с номером заявки: человек должен
          видеть, что она ушла, а номер — то, чем её называют в переписке. */}
      {done !== undefined && (
        <p className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-700">
          Заявка отправлена{done ? ` · №${done}` : ""}. Школа свяжется с гостем.
        </p>
      )}

      <PageNote>
        Заполняйте, когда гость рядом: заявка попадёт в школу с вашим кодом, и
        награда за него будет вашей — отправлять ссылку не нужно. Скидка гостю
        применяется по вашим условиям, как и по ссылке.
      </PageNote>

      <div className="mt-6">
        <RecordGuestForm
          services={services}
          plan={profile.plan}
          today={vnToday()}
        />
      </div>
    </div>
  );
}
