import type { Metadata } from "next";
import { getAppUser } from "@/lib/auth";
import { SettingsForm } from "@/app/[locale]/instructor/settings/SettingsForm";
import { PageHeader } from "@/components/cabinet/PageHeader";

export const metadata: Metadata = { title: "СММ · Настройки" };

// Настройки СММщика — только профиль: имя и фото, которые видны в карточке
// кабинета. Справочников, инвентаря и штата здесь нет намеренно: это хозяйство
// школы, им распоряжается админ в своих «Настройках».
//
// Форма — та же инструкторская (экшен updateProfileAction пишет строку самого
// залогиненного человека). «Цель по ЗП» скрыта: зарплату по инструкторской
// схеме СММщику не считают, прогресс-бара у него нет.
export default async function SmmSettingsPage() {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  return (
    <div>
      <PageHeader title="Настройки" hint="Имя и фото видны в кабинете" />
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
