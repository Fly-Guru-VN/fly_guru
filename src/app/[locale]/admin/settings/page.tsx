import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getFullDict } from "@/lib/dictionaries";
import { getFullEquipment } from "@/lib/equipment";
import { SettingsForm } from "@/app/[locale]/instructor/settings/SettingsForm";
import { DictionaryManager } from "./DictionaryManager";
import { EquipmentManager } from "./EquipmentManager";
import { StaffManager, type StaffRow } from "./StaffManager";

// Инструкторы с флагом «старший» (0033). Мягко: до наката миграции колонки нет,
// и обычный select уронил бы весь экран настроек — тогда просто не показываем
// блок (в этот момент старшинство ни на что и не влияет).
async function loadStaff(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<StaffRow[] | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, senior")
    .eq("role", "instructor")
    .order("name");
  if (error) return null;
  return (data ?? []).map((u) => ({
    id: u.id as string,
    name: (u.name as string) ?? "Без имени",
    senior: Boolean(u.senior),
  }));
}

// Настройки админа: профиль (имя и фото — видны в карточке сайдбара кабинета)
// и справочники школы (пак A). Форму профиля переиспользуем инструкторскую —
// экшен updateProfileAction self-scoped (пишет строку залогиненного юзера,
// requireStaff пускает и админа). Поле «Цель по ЗП» скрыто (showGoal=false):
// у админа нет прогресс-бара.

export default async function AdminSettingsPage() {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const supabase = await createClient();
  const [methods, equipment, staff] = await Promise.all([
    getFullDict(supabase, "payment_methods"),
    getFullEquipment(supabase),
    loadStaff(supabase),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Настройки</h1>
      <p className="mt-1 text-sm text-muted">
        Имя и фото видны в кабинете. Ниже — старшие инструкторы, форматы оплаты
        и инвентарь. Категории расходов редактируются во вкладке «Расходы».
      </p>
      <div className="mt-6">
        <SettingsForm
          name={user.name}
          photoUrl={user.photo_url}
          age={user.age}
          monthlyGoal={user.monthly_goal}
          showGoal={false}
        />
      </div>

      {staff && (
        <div className="mt-6">
          <StaffManager staff={staff} />
        </div>
      )}

      <div className="mt-6 space-y-3">
        <DictionaryManager
          table="payment_methods"
          title="Форматы оплаты"
          hint="Чем платил клиент. Обязателен при записи сессии, необязателен в заявке."
          placeholder="QR"
          items={methods}
        />
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-bold">Инвентарь</h2>
        <p className="mt-1 text-sm text-muted">
          Доски и крылья поштучно. Из этого списка инструктор выбирает единицу,
          когда фотографирует смену при открытии и закрытии.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <EquipmentManager
            kind="board"
            title="Доски"
            hint="По одной на строку — «Доска №1», «Fanatic 5.8»…"
            placeholder="Доска №1"
            items={equipment}
          />
          <EquipmentManager
            kind="wing"
            title="Крылья"
            hint="По одному на строку — «Крыло 4.0», «Duotone Unit 5»…"
            placeholder="Крыло 4.0"
            items={equipment}
          />
        </div>
      </div>
    </div>
  );
}
