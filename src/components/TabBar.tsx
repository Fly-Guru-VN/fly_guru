"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { SlidingHighlight, hasRealMouse } from "./SlidingHighlight";
import { IconArrowRight } from "./icons";

export type TabBarItem = {
  key: string;
  label: string;
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

// Полоса вкладок в белой пилюле с переезжающей плашкой — общая для прайса и
// магазина. Сами панели компонент не рисует: он только говорит, какая вкладка
// выбрана (onSelect), а панели с id `${idPrefix}-panel-${key}` рисует хозяин.
//
// Подсветка — тот же приём, что в шапке сайта: не перекраска кнопки, а плашка,
// которая ПЕРЕЕЗЖАЕТ с вкладки на вкладку (SlidingHighlight) и подтягивается к
// той, на которую навели мышкой.
//
// Наведение считаем здесь, а не флагом followHover внутри SlidingHighlight,
// потому что от него зависит не только плашка, но и ЦВЕТ текста. Плашка тут
// тёмно-бирюзовая на белой полосе: у вкладки под ней текст белый, у остальных —
// обычный. Отдай мы наведение внутрь компонента, плашка уехала бы к вкладке под
// курсором, а белый текст остался на выбранной — то есть пропал бы на белом.
export function TabBar({
  tabs,
  active,
  onSelect,
  idPrefix,
  ariaLabel,
}: {
  tabs: TabBarItem[];
  active: string;
  onSelect: (key: string) => void;
  idPrefix: string;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  // Докручена ли лента вкладок до конца. Пока нет — у правого края висит
  // подсказка «листай вправо»: на телефоне вкладки в экран не влезают, и без
  // неё человек видит часть и думает, что это все.
  const [more, setMore] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const checkMore = useCallback(() => {
    const el = barRef.current;
    if (!el) return;
    setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    // Ленту листают — значит человек не наводит, а прокручивает. Наведение,
    // оставшееся от предыдущего касания, увело бы плашку с выбранной вкладки.
    setHover(null);
  }, []);

  // Считаем при первой отрисовке и при смене ширины окна: с lg лента перестаёт
  // прокручиваться, и подсказка должна пропасть сама.
  useEffect(() => {
    checkMore();
    window.addEventListener("resize", checkMore);
    return () => window.removeEventListener("resize", checkMore);
  }, [checkMore]);

  // Куда встала плашка: под курсором, а если курсора нет — на выбранной.
  const lit = hover ?? active;

  // Стрелками ходим по вкладкам, как это принято в наборах вкладок: фокус
  // переезжает на соседнюю и она сразу открывается.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = tabs.findIndex((tab) => tab.key === active);
    const next = tabs[(i + step + tabs.length) % tabs.length];
    onSelect(next.key);
    barRef.current
      ?.querySelector<HTMLElement>(`[data-tab="${next.key}"]`)
      ?.focus();
  };

  return (
    // Полоса вкладок. На телефоне плашки в строку не помещаются — полоса
    // листается пальцем (класс .rail прячет полосу прокрутки), с прилипанием,
    // чтобы палец не останавливал её посреди вкладки. Отрицательные поля с
    // обеих сторон — чтобы на телефоне лента уходила под края экрана, а не
    // обрывалась по отступу контейнера.
    <div className="relative -mx-4 overflow-hidden border-y border-line bg-surface sm:-mx-6 lg:mx-0 lg:rounded-full lg:border lg:shadow-[0_16px_36px_-28px_rgba(15,34,51,0.55)]">
      <div
        ref={barRef}
        onScroll={checkMore}
        // Прилипание — только там, где лента реально листается. С lg все
        // вкладки стоят на месте, а snap-mandatory там продолжал бы «доводить»
        // ленту на каждый чих и подёргивать текст.
        // scroll-px обязателен вместе с px: без него прилипание подтягивает
        // первую вкладку к самому краю экрана, игнорируя поле ленты, — она
        // упиралась в край и вылезала за него (та же грабля описана в Rail).
        className="rail flex snap-x snap-mandatory overflow-x-auto px-4 py-2 scroll-px-4 sm:px-6 sm:scroll-px-6 lg:snap-none lg:px-2"
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        // ⚠️ pointerover с проверкой мыши, а НЕ mouseover. Палец, легший на
        // ленту чтобы её протянуть, шлёт браузеру и pointerover, и
        // синтетический mouseover — плашка уезжала на вкладку под пальцем,
        // хотя выбор не менялся, и там залипала: mouseleave после касания не
        // приходит. Наведение бывает только мышкой, её и слушаем.
        onPointerOver={(e) => {
          // Мало проверить pointerType: iOS Safari после тапа досылает
          // «как бы мышиные» события с тем же типом. hasRealMouse
          // спрашивает у самого устройства, бывает ли у него наведение.
          if (e.pointerType !== "mouse" || !hasRealMouse()) return;
          const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]");
          setHover(el?.dataset.tab ?? null);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <SlidingHighlight
          activeKey={lit}
          pillClassName="bg-primary"
          // На телефоне переезда НЕТ вовсе: плашка просто оказывается на
          // нажатой вкладке. Наведения там нет, так что показывать движение
          // нечему, а лента в этот момент ещё и подкручивается к вкладке —
          // два движения разом читались как рывок.
          //
          // На ПК кривая БЕЗ перелёта, в отличие от шапки: полоса вкладок —
          // прокручиваемая лента, и плашка, проскочившая за правый край,
          // раздувает её ширину — лента подкручивается сама и дёргает весь
          // текст (замер: скачок 8 px). Без перелёта плашка всегда в границах
          // ряда, и лента этого не замечает.
          //
          // will-change тоже только с lg. На телефоне лента листается вбок, а
          // вынесенная на слой видеокарты плашка отстаёт от такой ленты в iOS
          // Safari — она «отклеивалась» от своей вкладки, и под ней проезжали
          // чужие (см. комментарий у DEFAULT_MOTION в SlidingHighlight).
          motionClassName="transition-none lg:transition-transform lg:duration-[520ms] lg:ease-[cubic-bezier(0.22,1,0.36,1)] lg:will-change-transform motion-reduce:lg:transition-none"
          // min-w-full, а не flex-1: лента должна быть ШИРИНОЙ ПО ВКЛАДКАМ,
          // иначе она ровно по экрану, вкладки вылезают за её край, и
          // прокручивать становится нечего — на телефоне последние вкладки
          // просто не достать.
          className="flex min-w-full shrink-0 gap-1"
        >
          {tabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${key}`}
              aria-selected={key === active}
              aria-controls={`${idPrefix}-panel-${key}`}
              // Роящийся tabindex: в набор вкладок Tab заводит один раз, а
              // дальше внутри него ходят стрелками.
              tabIndex={key === active ? 0 : -1}
              data-tab={key}
              onClick={() => onSelect(key)}
              // relative обязателен: плашка absolute и без него накрыла бы
              // текст вкладки.
              // На телефоне вкладка шириной по своей подписи (лента
              // листается), с lg все делят полосу поровну.
              className={`relative flex shrink-0 snap-start items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition-colors lg:grow lg:basis-0 ${
                key === lit
                  ? "text-white"
                  : key === active
                    // Плашка уехала под курсор — но выбранная вкладка должна
                    // остаться видной, иначе, водя мышкой по полосе, человек
                    // теряет, что у него открыто.
                    ? "text-primary"
                    : "text-muted hover:text-ink"
              }`}
            >
              <Icon aria-hidden className="h-5 w-5 shrink-0" />
              {label}
            </button>
          ))}
        </SlidingHighlight>
      </div>

      {/* Указатель «есть ещё вправо»: мягкая растушёвка у правого края и
          стрелка. Только на телефоне и только пока лента не докручена — на ПК
          все вкладки и так на виду. pointer-events-none, чтобы подсказка не
          перехватывала тап по вкладке под ней. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 flex items-center pl-8 pr-2 transition-opacity duration-200 lg:hidden ${
          more ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background: "linear-gradient(to right, transparent, var(--color-surface) 55%)",
        }}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
          <IconArrowRight className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
