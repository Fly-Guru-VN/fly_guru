import {
  CabinetSidebar,
  type CabinetNavGroup,
} from "@/components/cabinet/CabinetSidebar";
import { INSTRUCTOR_UPDATES_SEEN_KEY } from "@/components/cabinet/useUpdatesSeen";

// Боковое меню кабинета инструктора. Само меню рисует общий CabinetSidebar —
// здесь только список разделов и карточка профиля.

const UPDATES_HREF = "/instructor/updates";

// Разделы группами — как в админке (10.08.2026). Тринадцать пунктов подряд с
// подписью под каждым читались как сплошная серая простыня.
//
// «Сегодня» — первым: сводка дня (ЗП, выручка, 35% Марине, касса) нужна каждый
// день и по несколько раз. Пятую вкладку в нижнюю панель телефона не ставим:
// подписи там и так 11 пикселей.
const GROUPS: CabinetNavGroup[] = [
  {
    title: "Каждый день",
    items: [
      { href: "/instructor/today", label: "Сегодня", primary: true },
      { href: "/instructor/bookings", label: "Записи", primary: true },
      { href: "/instructor/record", label: "Записать клиента", short: "Записать", primary: true },
      { href: "/instructor/shift", label: "Смена", primary: true },
    ],
  },
  {
    title: "Работа",
    items: [
      { href: "/instructor/sessions", label: "Сессии" },
      { href: "/instructor/clients", label: "Клиенты" },
      { href: "/instructor/calendar", label: "Календарь" },
      { href: "/instructor/subscription", label: "Абонемент" },
      { href: "/instructor/writeoff", label: "Списание" },
    ],
  },
  {
    title: "Деньги",
    items: [
      { href: "/instructor/stats", label: "Статистика" },
      { href: "/instructor/expenses", label: "Расходы" },
    ],
  },
  {
    title: "Система",
    items: [
      { href: UPDATES_HREF, label: "Обновления" },
      { href: "/instructor/settings", label: "Настройки" },
    ],
  },
];

export function Sidebar({
  name,
  photoUrl,
  amountLabel,
  amountSub,
  activeCount,
}: {
  name: string;
  photoUrl: string | null;
  amountLabel: string;
  amountSub: string;
  activeCount: number;
}) {
  return (
    <CabinetSidebar
      groups={GROUPS}
      profile={{ name, photoUrl, amount: { label: amountLabel, sub: amountSub } }}
      badge={{ href: "/instructor/bookings", count: activeCount }}
      updates={{ href: UPDATES_HREF, seenKey: INSTRUCTOR_UPDATES_SEEN_KEY }}
    />
  );
}
