"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SlidingHighlight } from "./SlidingHighlight";
import { PriceCard } from "./PriceCard";
import { Rail, RailItem } from "./Rail";
import { DotsRail } from "./DotsRail";
import {
  IconFoil,
  IconTandem,
  IconWaves,
  IconClub,
  IconPalm,
  IconPlay,
  IconArrowRight,
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
  // Докручена ли лента вкладок до конца. Пока нет — у правого края висит
  // подсказка «листай вправо»: на телефоне шесть вкладок в экран не влезают, и
  // без неё человек видит четыре и думает, что это все.
  const [more, setMore] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const checkMore = useCallback(() => {
    const el = barRef.current;
    if (!el) return;
    setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  // Считаем при первой отрисовке и при смене ширины окна: с lg лента перестаёт
  // прокручиваться, и подсказка должна пропасть сама.
  useEffect(() => {
    checkMore();
    window.addEventListener("resize", checkMore);
    return () => window.removeEventListener("resize", checkMore);
  }, [checkMore]);

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
      <div className="relative -mx-4 overflow-hidden border-y border-line bg-surface sm:-mx-6 lg:mx-0 lg:rounded-full lg:border lg:shadow-[0_16px_36px_-28px_rgba(15,34,51,0.55)]">
        <div
          ref={barRef}
          onScroll={checkMore}
          // Прилипание — только там, где лента реально листается. С lg все
          // шесть вкладок стоят на месте, а snap-mandatory там продолжал бы
          // «доводить» ленту на каждый чих и подёргивать текст.
          // scroll-px обязателен вместе с px: без него прилипание подтягивает
          // первую вкладку к самому краю экрана, игнорируя поле ленты, — она
          // упиралась в край и вылезала за него (та же грабля описана в Rail).
          className="rail flex snap-x snap-mandatory overflow-x-auto px-4 py-2 scroll-px-4 sm:px-6 sm:scroll-px-6 lg:snap-none lg:px-2"
          role="tablist"
          aria-label="Группы услуг"
          onKeyDown={onKeyDown}
          // ⚠️ pointerover с проверкой мыши, а НЕ mouseover. Палец, легший на
          // ленту чтобы её протянуть, шлёт браузеру и pointerover, и
          // синтетический mouseover — плашка уезжала на вкладку под пальцем,
          // хотя выбор не менялся, и там залипала: mouseleave после касания не
          // приходит. Наведение бывает только мышкой, её и слушаем.
          onPointerOver={(e) => {
            if (e.pointerType !== "mouse") return;
            const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]");
            setHover((el?.dataset.tab as ServiceCategory) ?? null);
          }}
          onPointerLeave={() => setHover(null)}
        >
          <SlidingHighlight
            activeKey={lit}
            pillClassName="rounded-full bg-primary"
            // На телефоне переезда НЕТ вовсе: плашка просто оказывается на
            // нажатой вкладке. Наведения там нет, так что показывать движение
            // нечему, а лента в этот момент ещё и подкручивается к вкладке —
            // два движения разом читались как рывок.
            //
            // На ПК кривая БЕЗ перелёта, в отличие от шапки: полоса вкладок —
            // прокручиваемая лента, и плашка, проскочившая за правый край,
            // раздувала её ширину, отчего лента подкручивалась сама и дёргала
            // весь текст (замер: скачок 8 px).
            motionClassName="transition-none lg:transition-[transform,width,height] lg:duration-[420ms] lg:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:lg:transition-none"
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

        {/* Указатель «есть ещё вправо»: мягкая растушёвка у правого края и
            стрелка. Только на телефоне и только пока лента не докручена — на
            ПК все шесть вкладок и так на виду. pointer-events-none, чтобы
            подсказка не перехватывала тап по вкладке под ней. */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 right-0 flex items-center pl-8 pr-2 transition-opacity duration-200 lg:hidden ${
            more ? "opacity-100" : "opacity-0"
          }`}
          style={{
            background:
              "linear-gradient(to right, transparent, var(--color-surface) 55%)",
          }}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
            <IconArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>

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
        // содержимое при переходе между страницами сайта. Анимация играет один
        // раз при появлении элемента, а панели из разметки не исчезают —
        // поэтому меняем key, и лента собирается заново (приём из PageTransition).
        const railKey = g.cat === active ? `on-${seq}` : "off";
        const railClass = `animate-page-in ${cols}`;
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
              <DotsRail key={railKey} count={g.items.length} className={railClass}>
                {cards}
              </DotsRail>
            ) : (
              <Rail key={railKey} className={`mt-8 ${railClass}`}>
                {cards}
              </Rail>
            )}
          </div>
        );
      })}
    </>
  );
}
