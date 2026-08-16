import {
  CabinetSidebar,
  type CabinetNavGroup,
} from "@/components/cabinet/CabinetSidebar";

// Боковое меню кабинета механика. Само меню рисует общий CabinetSidebar —
// здесь только список разделов и карточка профиля.
//
// Отличий от инструктора два: в профиле нет ЗП (механику её не считают) и нет
// красного счётчика записей — вкладки заявок у него тоже нет, он их только
// заводит. Ленты обновлений у механика пока нет, поэтому и точки «есть новое».

const GROUPS: CabinetNavGroup[] = [
  {
    title: "Каждый день",
    items: [
      { href: "/mechanic/calendar", label: "Календарь", primary: true },
      { href: "/mechanic/record", label: "Записать клиента", short: "Записать", primary: true },
      { href: "/mechanic/shift", label: "Смена", primary: true },
      { href: "/mechanic/sessions", label: "Сессии", primary: true },
    ],
  },
  {
    title: "Своё",
    items: [
      { href: "/mechanic/expenses", label: "Расходы" },
      { href: "/mechanic/settings", label: "Настройки" },
    ],
  },
];

export function Sidebar({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl: string | null;
}) {
  return (
    <CabinetSidebar
      groups={GROUPS}
      profile={{ name, photoUrl, role: "Механик" }}
    />
  );
}
