import type { Metadata } from "next";
import { isAdminLike, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAgentProfile, getAgentStats } from "@/lib/agentCabinet";
import { vnWeekToDate } from "@/lib/dates";
import { vnd } from "@/lib/stats";
import { AdminViewBanner } from "@/components/cabinet/AdminViewBanner";
import { ToastHost } from "@/components/cabinet/Toast";
import { Sidebar } from "./Sidebar";

export const metadata: Metadata = { title: "Кабинет агента" };

// Кабинет агента (0049, решение David от 25.08.2026). Оболочка — та же, что у
// механика и инструктора: на ПК колонка меню слева, на телефоне нижняя панель.
//
// В карточке профиля стоит одна цифра — «к выплате»: это единственное, ради
// чего агент вообще заходит. Считается за всё время (заработано минус выдано),
// поэтому от выбранного на «Статистике» периода не зависит.
export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("agent", "/agent");

  const supabase = await createClient();
  const profile = await getAgentProfile(supabase, user.id);
  // Админ, заглянувший в кабинет агента, своей строки агента не имеет — цифру
  // в карточке просто не показываем, экраны ниже объяснят это словами.
  const stats = profile
    ? await getAgentStats(supabase, profile, vnWeekToDate())
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 md:h-[calc(100dvh-4rem)] md:py-0">
      <ToastHost />
      <div className="md:flex md:h-full md:gap-6">
        <Sidebar
          name={user.name}
          photoUrl={user.photo_url}
          due={stats ? vnd(stats.due) : null}
        />
        <main className="scroll-soft mt-4 min-w-0 md:mt-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:py-6">
          {isAdminLike(user.role) && <AdminViewBanner cabinet="агента" />}
          {children}
        </main>
      </div>
    </div>
  );
}
