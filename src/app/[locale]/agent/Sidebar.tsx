import {
  CabinetSidebar,
  type CabinetNavGroup,
} from "@/components/cabinet/CabinetSidebar";

// Боковое меню кабинета агента. В нижнюю панель телефона вынесены три раздела,
// которыми пользуются на ходу: записать гостя, свои цифры, своя ссылка.
// Материалы, выплаты и настройки открывают редко — они в листе «Ещё».

const GROUPS: CabinetNavGroup[] = [
  {
    title: "Каждый день",
    items: [
      // «Записать гостя» — первым: это единственное действие в кабинете, всё
      // остальное — просмотр.
      { href: "/agent/record", label: "Записать гостя", short: "Записать", primary: true },
      { href: "/agent", label: "Статистика", primary: true },
      { href: "/agent/link", label: "Моя ссылка", short: "Ссылка", primary: true },
    ],
  },
  {
    title: "Своё",
    items: [
      { href: "/agent/materials", label: "Материалы" },
      { href: "/agent/payouts", label: "Выплаты" },
      { href: "/agent/settings", label: "Настройки" },
    ],
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
