import { getAppUser } from "@/lib/auth";
import { SettingsForm } from "./SettingsForm";
import { PageHeader } from "@/components/cabinet/PageHeader";

// Настройки профиля: отображаемое имя, фото, возраст, личная цель по ЗП
// (питает прогресс-бар на главном экране кабинета).

export default async function SettingsPage() {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  return (
    <div>
      <PageHeader
        title="Настройки"
        hint="Имя и фото видны в кабинете. Цель по ЗП — только ваша."
      />
      <div className="mt-6">
        <SettingsForm
          name={user.name}
          photoUrl={user.photo_url}
          age={user.age}
          monthlyGoal={user.monthly_goal}
        />
      </div>
    </div>
  );
}
