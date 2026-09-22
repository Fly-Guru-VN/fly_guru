"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { TabBar } from "./TabBar";
import { PriceCard } from "./PriceCard";
import { Rail, RailItem } from "./Rail";
import { DotsRail } from "./DotsRail";
import {
  IconFoil,
  IconTandem,
  IconRent,
  IconClub,
  IconPalm,
  IconPlay,
} from "./icons";
import type { Service, ServiceCategory } from "@/content/services";

// Иконка вкладки. Живёт здесь, а не на странице: иконка — это компонент, а
// компоненты через границу «сервер → клиент» пропсами не передаются.
const TAB_ICON = {
  training: IconFoil,
  tandem: IconTandem,
  rental: IconRent,
  subscription: IconClub,
  tour: IconPalm,
  extra: IconPlay,
} as const;

export type PriceGroup = {
  cat: ServiceCategory;
  label: string;
  items: {
    service: Service;
    serviceId?: string;
    highlight?: boolean;
  }[];
};

// Сколько колонок под N карточек — считается для ПК, где лента разворачивается
// в сетку (см. Rail).
//
// Одной сеткой на все вкладки не обойтись: в обучении четыре карточки, а в
// прокате одна. В жёстких четырёх колонках эта одна вставала бы узкой полоской
// у левого края с пустотой на три четверти экрана — поэтому у коротких групп
// ряд ещё и сужается по центру (второе значение).
function layout(count: number): { cols: string; box: string } {
  if (count >= 4) return { cols: "md:grid-cols-2 lg:grid-cols-4", box: "" };
  if (count === 3) return { cols: "md:grid-cols-2 lg:grid-cols-3", box: "lg:mx-auto lg:max-w-5xl" };
  if (count === 2) return { cols: "md:grid-cols-2", box: "md:mx-auto md:max-w-3xl" };
  return { cols: "", box: "md:mx-auto md:max-w-sm" };
}

// Вкладки прайса: шесть тематических плашек, под ними — карточки услуг только
// выбранной группы. Страница при этом одна, ничего не перезагружается.
//
// Сама полоса вкладок с переезжающей плашкой — общий TabBar (он же в магазине).
//
// Все шесть групп лежат в разметке всегда, спрятанные атрибутом hidden:
// страница статическая (SSG), и в готовом HTML поисковик видит все цены разом,
// а не только первую вкладку.
export function PriceTabs({ groups }: { groups: PriceGroup[] }) {
  const t = useTranslations("Common");
  const [active, setActive] = useState<ServiceCategory>(groups[0]?.cat ?? "training");
  // Группы, чьи карточки уже всплывали. Всплытие играет ОДИН раз — когда группу
  // открыли впервые. Раньше оно играло при каждом переключении: лента карточек
  // пересобиралась заново, и этот пик работы приходился ровно на тот момент,
  // когда плашка вкладок доезжала до места, — она об него и спотыкалась.
  // Теперь панели просто прячутся и показываются, React ничего не пересобирает.
  const [played, setPlayed] = useState<ServiceCategory[]>([]);
  const select = (cat: ServiceCategory) => {
    if (cat === active) return;
    setActive(cat);
  };

  // Открытую группу помечаем как отыгравшую — но только после того, как
  // всплытие доиграло (220 мс, .animate-page-in), иначе снятый класс оборвал бы
  // его на полпути.
  const firstShow = !played.includes(active);
  useEffect(() => {
    if (!firstShow) return;
    const id = setTimeout(
      () => setPlayed((p) => (p.includes(active) ? p : [...p, active])),
      300,
    );
    return () => clearTimeout(id);
  }, [active, firstShow]);

  return (
    <>
      <TabBar
        tabs={groups.map((g) => ({ key: g.cat, label: g.label, Icon: TAB_ICON[g.cat] }))}
        active={active}
        onSelect={(key) => select(key as ServiceCategory)}
        idPrefix="price"
        ariaLabel={t("serviceGroups")}
      />

      {groups.map((g) => {
        const { cols, box } = layout(g.items.length);
        const cards = g.items.map((it) => (
          <RailItem key={it.service.id}>
            <PriceCard
              service={it.service}
              serviceId={it.serviceId}
              highlight={it.highlight}
            />
          </RailItem>
        ));
        // Карточки не просто появляются, а всплывают — тем же движением, что и
        // содержимое при переходе между страницами сайта. Играет оно только при
        // первом открытии группы: спрятанная панель, которую снова показали,
        // запускает css-анимацию сама, поэтому у отыгравших групп класса просто
        // нет.
        const railClass = `${g.cat === active && firstShow ? "animate-page-in " : ""}${cols}`;
        return (
          <div
            key={g.cat}
            id={`price-panel-${g.cat}`}
            role="tabpanel"
            aria-labelledby={`price-tab-${g.cat}`}
            hidden={g.cat !== active}
            className={box}
          >
            {/* На телефоне карточки листаются пальцем и выглядывают краем
                следующей — так же, как форматы на странице обучения. С точками
                под лентой, как у отзывов на главной; одной карточке точка не
                нужна, поэтому у «Проката» и «Абонемента» просто лента. */}
            {g.items.length > 1 ? (
              <DotsRail count={g.items.length} className={railClass}>
                {cards}
              </DotsRail>
            ) : (
              <Rail className={`mt-8 ${railClass}`}>
                {cards}
              </Rail>
            )}
          </div>
        );
      })}
    </>
  );
}
