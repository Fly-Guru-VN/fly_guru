import type { Metadata } from "next";
import { getAppUser } from "@/lib/auth";
import { SettingsForm } from "../../instructor/settings/SettingsForm";
import { PageHeader } from "@/components/cabinet/PageHeader";

export const metadata: Metadata = { title: "Механик · Настройки" };

// Настройки профиля: имя, фото, возраст. Поле «Цель по ЗП» скрыто (showGoal) —
// зарплату механику не считают, показывать цель было бы обещанием, которого
// система не выполняет.

export default async function MechanicSettingsPage() {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  return (
    <div>
      <PageHeader
        title="Настройки"
        hint="Имя и фото видны в кабинете и в календаре у админа."
      />
      <div className="mt-6">
        <SettingsForm
          name={user.name}
          photoUrl={user.photo_url}
          age={user.age}
          monthlyGoal={user.monthly_goal}
          showGoal={false}
        />
      </div>
    </div>
  );
}
