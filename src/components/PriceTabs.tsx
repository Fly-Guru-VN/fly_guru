"use client";

import { useRef, useState } from "react";
import { SlidingHighlight } from "./SlidingHighlight";
import { PriceCard } from "./PriceCard";
import {
  IconFoil,
  IconTandem,
  IconWaves,
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
  rental: IconWaves,
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

// Сколько колонок и какой ширины ряд под N карточек.
//
// Одной сеткой на все вкладки не обойтись: в обучении четыре карточки, а в
// прокате одна. В жёстких четырёх колонках эта одна вставала бы узкой полоской
// у левого края с пустотой на три четверти экрана.
function layout(count: number): string {
  if (count >= 4) return "sm:grid-cols-2 lg:grid-cols-4";
  if (count === 3) return "sm:grid-cols-2 lg:grid-cols-3 lg:max-w-5xl";
  if (count === 2) return "sm:grid-cols-2 sm:max-w-3xl";
  return "max-w-sm";
}

// Вкладки прайса: шесть тематических плашек, под ними — карточки услуг только
// выбранной группы. Страница при этом одна, ничего не перезагружается.
//
// Подсветка — тот же приём, что в шапке сайта: не перекраска кнопки, а плашка,
// которая ПЕРЕЕЗЖАЕТ с вкладки на вкладку с лёгким перелётом (SlidingHighlight)
// и подтягивается к той, на которую навели мышкой.
//
// Наведение считаем здесь, а не флагом followHover внутри SlidingHighlight,
// потому что от него зависит не только плашка, но и ЦВЕТ текста. Плашка тут
// тёмно-бирюзовая на белой полосе: у вкладки под ней текст белый, у остальных —
// обычный. Отдай мы наведение внутрь компонента, плашка уехала бы к вкладке под
// курсором, а белый текст остался на выбранной — то есть пропал бы на белом.
//
// Все шесть групп лежат в разметке всегда, спрятанные атрибутом hidden:
// страница статическая (SSG), и в готовом HTML поисковик видит все цены разом,
// а не только первую вкладку.
export function PriceTabs({ groups }: { groups: PriceGroup[] }) {
  const [active, setActive] = useState<ServiceCategory>(groups[0]?.cat ?? "training");
  const [hover, setHover] = useState<ServiceCategory | null>(null);
  // Счётчик переключений. Нужен, чтобы карточки всплывали при КАЖДОЙ смене
  // вкладки: css-анимация играет один раз при появлении элемента, а панели из
  // разметки не исчезают. Тот же приём, что в PageTransition, — меняем key и
  // элемент собирается заново.
  const [seq, setSeq] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  const select = (cat: ServiceCategory) => {
    if (cat === active) return;
    setActive(cat);
    setSeq((n) => n + 1);
  };

  // Куда встала плашка: под курсором, а если курсора нет — на выбранной.
  const lit = hover ?? active;

  // Стрелками ходим по вкладкам, как это принято в наборах вкладок: фокус
  // переезжает на соседнюю и она сразу открывается.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = groups.findIndex((g) => g.cat === active);
    const next = groups[(i + step + groups.length) % groups.length];
    select(next.cat);
    barRef.current
      ?.querySelector<HTMLElement>(`[data-tab="${next.cat}"]`)
      ?.focus();
  };

  return (
    <>
      {/* Полоса вкладок. На телефоне шесть плашек в строку не помещаются —
          полоса листается пальцем (класс .rail прячет полосу прокрутки), с
          прилипанием, чтобы палец не останавливал её посреди вкладки.
          Отрицательные поля с обеих сторон — чтобы на телефоне лента уходила
          под края экрана, а не обрывалась по отступу контейнера. */}
      <div className="-mx-4 overflow-hidden border-y border-line bg-surface sm:-mx-6 lg:mx-0 lg:rounded-full lg:border lg:shadow-[0_16px_36px_-28px_rgba(15,34,51,0.55)]">
        <div
          ref={barRef}
          // Прилипание — только там, где лента реально листается. С lg все
          // шесть вкладок стоят на месте, а snap-mandatory там продолжал бы
          // «доводить» ленту на каждый чих и подёргивать текст.
          className="rail flex snap-x snap-mandatory overflow-x-auto px-4 py-2 sm:px-6 lg:snap-none lg:px-2"
          role="tablist"
          aria-label="Группы услуг"
          onKeyDown={onKeyDown}
          onMouseOver={(e) => {
            const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]");
            setHover((el?.dataset.tab as ServiceCategory) ?? null);
          }}
          onMouseLeave={() => setHover(null)}
        >
          <SlidingHighlight
            activeKey={lit}
            pillClassName="rounded-full bg-primary"
            // Кривая БЕЗ перелёта, в отличие от шапки. Полоса вкладок здесь —
            // прокручиваемая лента, и плашка, проскочившая за правый край,
            // раздувала её ширину: лента подкручивалась сама и дёргала весь
            // текст (замер: скачок 8 px). Заодно спокойнее на глаз — та же
            // кривая, что у всплывающих карточек и листов кабинета.
            motionClassName="transition-[transform,width,height] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            // min-w-full, а не flex-1: лента должна быть ШИРИНОЙ ПО ВКЛАДКАМ,
            // иначе она ровно по экрану, вкладки вылезают за её край, и
            // прокручивать становится нечего — на телефоне последние вкладки
            // просто не достать.
            className="flex min-w-full shrink-0 gap-1"
          >
            {groups.map((g) => {
              const Icon = TAB_ICON[g.cat];
              return (
                <button
                  key={g.cat}
                  type="button"
                  role="tab"
                  id={`price-tab-${g.cat}`}
                  aria-selected={g.cat === active}
                  aria-controls={`price-panel-${g.cat}`}
                  // Роящийся tabindex: в набор вкладок Tab заводит один раз, а
                  // дальше внутри него ходят стрелками.
                  tabIndex={g.cat === active ? 0 : -1}
                  data-tab={g.cat}
                  onClick={() => select(g.cat)}
                  // relative обязателен: плашка absolute и без него накрыла бы
                  // текст вкладки.
                  // На телефоне вкладка шириной по своей подписи (лента
                  // листается), с sm — все шесть делят полосу поровну.
                  className={`relative flex shrink-0 snap-start items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition-colors lg:grow lg:basis-0 ${
                    g.cat === lit
                      ? "text-white"
                      : g.cat === active
                        // Плашка уехала под курсор — но выбранная вкладка
                        // должна остаться видной, иначе, водя мышкой по
                        // полосе, человек теряет, что у него открыто.
                        ? "text-primary"
                        : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon aria-hidden className="h-5 w-5 shrink-0" />
                  {g.label}
                </button>
              );
            })}
          </SlidingHighlight>
        </div>
      </div>

      {groups.map((g) => (
        <div
          key={g.cat}
          id={`price-panel-${g.cat}`}
          role="tabpanel"
          aria-labelledby={`price-tab-${g.cat}`}
          hidden={g.cat !== active}
        >
          {/* Карточки не просто появляются, а всплывают — тем же движением,
              что и содержимое при переходе между страницами сайта. */}
          <div
            key={g.cat === active ? `on-${seq}` : "off"}
            className={`animate-page-in mx-auto mt-8 grid gap-5 ${layout(g.items.length)}`}
          >
            {g.items.map((it) => (
              <PriceCard
                key={it.service.id}
                service={it.service}
                serviceId={it.serviceId}
                highlight={it.highlight}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
