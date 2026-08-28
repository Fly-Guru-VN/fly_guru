import {
  CabinetSidebar,
  type CabinetNavGroup,
} from "@/components/cabinet/CabinetSidebar";
import { SMM_UPDATES_SEEN_KEY } from "@/components/cabinet/useUpdatesSeen";

// Боковое меню кабинета СММщика. Само меню рисует общий CabinetSidebar —
// здесь только список разделов и карточка профиля.
//
// Отличий от админского два: разделов тринадцать вместо шестнадцати (нет
// календаря, выплат, членов клуба и услуг — это не его работа, зато есть своя
// «Моя ЗП») и в карточке профиля не деньги школы, а его собственная выплаченная
// ЗП — как у разработчика (28.08.2026). Деньги школы он видит только как
// выручку, во вкладке «Статистика».
//
// «Смена» с 21.08.2026: СММщик выходит на пляж наравне с инструкторами, и день
// на смене считается ему по инструкторской формуле. Экран — тот же, что у
// инструктора (см. /smm/shift).

const UPDATES_HREF = "/smm/updates";

// Порядок групп — по частоте, как в админке. «Реклама» стоит выше, чем у
// админа: для СММщика это рабочий стол, а не справка.
const GROUPS: CabinetNavGroup[] = [
  {
    title: "Каждый день",
    items: [
      { href: "/smm/shift", label: "Смена", primary: true },
      { href: "/smm/bookings", label: "Заявки", primary: true },
      { href: "/smm/record", label: "Записать клиента", short: "Записать", primary: true },
      { href: "/smm/sessions", label: "Сессии" },
    ],
  },
  {
    title: "Реклама",
    items: [
      { href: "/smm/materials", label: "Материалы", primary: true },
      { href: "/smm/sources", label: "Источники", primary: true },
    ],
  },
  {
    title: "Люди",
    items: [
      { href: "/smm/clients", label: "Клиенты" },
      { href: "/smm/subscriptions", label: "Абонементы" },
      { href: "/smm/agents", label: "Агенты" },
    ],
  },
  {
    title: "Деньги",
    items: [
      { href: "/smm/dashboard", label: "Статистика" },
      { href: "/smm/salary", label: "Моя ЗП" },
      { href: "/smm/expenses", label: "Расходы" },
    ],
  },
  {
    title: "Система",
    items: [
      { href: UPDATES_HREF, label: "Обновления" },
      { href: "/smm/settings", label: "Настройки" },
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
        // Сумма первой строкой, имя мелким сверху — ровно как у разработчика
        // в админке: в карточку смотрят ради денег, своё имя не читают.
        amountFirst: true,
      }}
      badge={{ href: "/smm/bookings", count: freshCount }}
      updates={{ href: UPDATES_HREF, seenKey: SMM_UPDATES_SEEN_KEY }}
    />
  );
}
