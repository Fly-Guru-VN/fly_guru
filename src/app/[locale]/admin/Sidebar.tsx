import {
  CabinetSidebar,
  type CabinetNavGroup,
} from "@/components/cabinet/CabinetSidebar";
import { ADMIN_UPDATES_SEEN_KEY } from "@/components/cabinet/useUpdatesSeen";

// Боковое меню админки. Само меню рисует общий CabinetSidebar (он же у
// инструктора, механика и СММщика) — здесь только список разделов и что
// показывать в карточке профиля.

const UPDATES_HREF = "/admin/updates";

// Разделы сгруппированы по смыслу (10.08.2026). Шестнадцать пунктов подряд —
// это полтора экрана серого текста, по которому глаз каждый раз ищет заново.
// Группы дают опору: «деньги — вон тот кусок списка», и до нужного пункта
// долетаешь не читая.
//
// Порядок групп — по частоте: сначала то, что открывают каждый день.
// primary — раздел попадает в нижнюю панель телефона; таких берём четыре,
// пятая вкладка не влезает (подписи там и так 11 пикселей).
const GROUPS: CabinetNavGroup[] = [
  {
    title: "Каждый день",
    items: [
      { href: "/admin/bookings", label: "Заявки", primary: true },
      { href: "/admin/record", label: "Записать клиента", short: "Записать", primary: true },
      { href: "/admin/calendar", label: "Календарь", primary: true },
      { href: "/admin/sessions", label: "Сессии" },
    ],
  },
  {
    title: "Люди",
    items: [
      { href: "/admin/clients", label: "Клиенты" },
      { href: "/admin/subscriptions", label: "Абонементы" },
      { href: "/admin/agents", label: "Агенты" },
      { href: "/admin/members", label: "Члены клуба" },
    ],
  },
  {
    title: "Деньги",
    items: [
      { href: "/admin/dashboard", label: "Статистика", primary: true },
      { href: "/admin/payroll", label: "Выплата зарплаты" },
      { href: "/admin/expenses", label: "Расходы" },
    ],
  },
  {
    title: "Реклама",
    items: [
      { href: "/admin/materials", label: "Материалы" },
      { href: "/admin/sources", label: "Источники" },
    ],
  },
  {
    title: "Система",
    items: [
      { href: "/admin/services", label: "Услуги" },
      { href: UPDATES_HREF, label: "Обновления" },
      { href: "/admin/settings", label: "Настройки" },
    ],
  },
];

export function Sidebar({
  name,
  photoUrl,
  amountLabel,
  amountSub,
  freshCount,
}: {
  name: string;
  photoUrl: string | null;
  amountLabel: string;
  amountSub: string;
  freshCount: number;
}) {
  return (
    <CabinetSidebar
      groups={GROUPS}
      profile={{
        name,
        photoUrl,
        amount: { label: amountLabel, sub: amountSub },
        // Деньги школы — главная строка карточки: ради них сюда и смотрят.
        amountFirst: true,
      }}
      badge={{ href: "/admin/bookings", count: freshCount }}
      updates={{ href: UPDATES_HREF, seenKey: ADMIN_UPDATES_SEEN_KEY }}
    />
  );
}
