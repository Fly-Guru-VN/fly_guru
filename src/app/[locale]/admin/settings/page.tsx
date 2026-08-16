import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getFullDict } from "@/lib/dictionaries";
import { getFullEquipment } from "@/lib/equipment";
import { SettingsForm } from "@/app/[locale]/instructor/settings/SettingsForm";
import { DictionaryManager } from "./DictionaryManager";
import { EquipmentManager } from "./EquipmentManager";
import { StaffManager, type StaffRow } from "./StaffManager";
import { employmentLabel, isFired, loadInstructors } from "@/lib/staff";
import { vnToday } from "@/lib/dates";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";

// Штат: старшинство (0033) плюс трудовой период (0036).
async function loadStaff(
  supabase: Awaited<ReturnType<typeof createClient>>,
  today: string,
): Promise<StaffRow[]> {
  const staff = await loadInstructors(supabase);
  return staff.map((m) => ({
    id: m.id,
    name: m.name || "Без имени",
    senior: m.senior,
    hiredAt: m.hiredAt,
    leftAt: m.leftAt,
    fired: isFired(m, today),
    label: employmentLabel(m, today),
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
  const today = vnToday();
  const [methods, channels, equipment, staff] = await Promise.all([
    getFullDict(supabase, "payment_methods"),
    getFullDict(supabase, "booking_channels"),
    getFullEquipment(supabase),
    loadStaff(supabase, today),
  ]);

  return (
    <div>
      <PageHeader
        title="Настройки"
        hint="Профиль, старшие инструкторы, справочники форм, инвентарь"
      />
      <PageNote>Имя и фото видны всем в кабинете. Категории расходов редактируются не здесь, а во вкладке «Расходы».</PageNote>
      <div className="mt-6">
        <SettingsForm
          name={user.name}
          photoUrl={user.photo_url}
          age={user.age}
          monthlyGoal={user.monthly_goal}
          showGoal={false}
        />
      </div>

      {staff.length > 0 && (
        <div className="mt-6">
          <StaffManager staff={staff} today={today} />
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
        <DictionaryManager
          table="booking_channels"
          title="Каналы записи"
          hint="Откуда пришёл гость. Выпадашка в «Новой заявке» и в «Записать клиента»; канал из «Материалов» добавляйте с тем же названием — тогда переходы по ссылке и записи руками сойдутся в одну строку «Источников»."
          placeholder="Instagram"
          items={channels}
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
