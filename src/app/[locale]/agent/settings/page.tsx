import type { Metadata } from "next";
import { getAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SettingsForm } from "../../instructor/settings/SettingsForm";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { updateAgentProfileAction } from "../actions";

export const metadata: Metadata = { title: "Агент · Настройки" };

// Профиль агента: имя, фото и дата рождения. Форма — общая с кабинетами
// сотрудников, только поле «Возраст» заменено датой рождения и сохраняет её
// свой экшен (агент не полевой сотрудник, updateProfileAction его не пустит).
export default async function AgentSettingsPage() {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  // Дату рождения читаем отдельным запросом, а не в getAppUser: колонку
  // добавляет 0049, и пока миграция не накатана, сломается только этот экран, а
  // не вход во все кабинеты школы. По той же причине ошибку не роняем — форма
  // просто откроется с пустым полем.
  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("birthday")
    .eq("id", user.id)
    .maybeSingle();
  const birthday = (data?.birthday as string | null | undefined) ?? null;

  return (
    <div>
      <PageHeader
        title="Настройки"
        hint="Имя и фото видит начальник школы в разделе «Агенты»."
      />
      <div className="mt-6">
        <SettingsForm
          name={user.name}
          photoUrl={user.photo_url}
          age={user.age}
          monthlyGoal={null}
          showGoal={false}
          birthday={birthday}
          action={updateAgentProfileAction}
        />
      </div>
    </div>
  );
}
