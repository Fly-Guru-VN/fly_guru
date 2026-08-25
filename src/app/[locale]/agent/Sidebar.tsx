import {
  CabinetSidebar,
  type CabinetNavGroup,
} from "@/components/cabinet/CabinetSidebar";

// Боковое меню кабинета агента. Разделов ровно четыре — больше агенту нечего
// делать в системе: посмотреть свои цифры, взять ссылку, проверить выплаты,
// поправить профиль.

const GROUPS: CabinetNavGroup[] = [
  {
    title: "Моя работа",
    items: [
      { href: "/agent", label: "Статистика", primary: true },
      { href: "/agent/link", label: "Моя ссылка", short: "Ссылка", primary: true },
      { href: "/agent/payouts", label: "Выплаты", primary: true },
    ],
  },
  {
    title: "Своё",
    items: [{ href: "/agent/settings", label: "Настройки" }],
  },
];

export function Sidebar({
  name,
  photoUrl,
  due,
}: {
  name: string;
  photoUrl: string | null;
  /** «К выплате» за всё время. null — строки агента нет (сюда зашёл админ). */
  due: string | null;
}) {
  return (
    <CabinetSidebar
      groups={GROUPS}
      profile={{
        name,
        photoUrl,
        role: "Агент",
        ...(due ? { amount: { label: due, sub: "к выплате" } } : {}),
      }}
    />
  );
}
