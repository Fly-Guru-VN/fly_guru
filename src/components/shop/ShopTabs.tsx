"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { TabBar } from "../TabBar";
import { IconChat, IconFoil, IconWrench } from "../icons";

export type ShopTabKey = "efoils" | "accessories" | "help";
export const SHOP_TABS: ShopTabKey[] = ["efoils", "accessories", "help"];

const TAB_ICON = { efoils: IconFoil, accessories: IconWrench, help: IconChat } as const;

// Вкладки каталога: доски / аксессуары / помощь с выбором. Панели рисует
// сервер (карточки остаются серверными), здесь — только какая из них видна.
//
// Все три панели лежат в разметке всегда, спрятанные атрибутом hidden, как в
// прайсе: страница статическая, и поисковик видит весь каталог разом.
//
// Ключ вкладки — он же якорь адреса: ссылка `#accessories` с любого места
// страницы (кнопка героя, «Сравнить модели») открывает нужную вкладку и
// прокручивает к полосе. Тем же якорем можно поделиться ссылкой.
export function ShopTabs({
  labels,
  ariaLabel,
  panels,
}: {
  labels: Record<ShopTabKey, string>;
  ariaLabel: string;
  panels: Record<ShopTabKey, ReactNode>;
}) {
  const [active, setActive] = useState<ShopTabKey>("efoils");
  // Переключали ли вкладки. Панель всплывает при каждом переключении, но не
  // при загрузке страницы — первый экран не должен «прыгать».
  // Панели при этом не пересобираются (см. PriceTabs, почему это важно):
  // спрятанная панель, которую снова показали, запускает css-анимацию сама.
  const [touched, setTouched] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const select = (key: ShopTabKey) => {
    setActive(key);
    setTouched(true);
  };

  useEffect(() => {
    const isTab = (v: string): v is ShopTabKey => (SHOP_TABS as string[]).includes(v);

    // Пришли по ссылке с якорем («Все аксессуары» со страницы доски) —
    // открываем вкладку и докручиваем к ней: элемента с таким id на странице
    // нет, и сам браузер никуда не прокрутит.
    const initial = window.location.hash.slice(1);
    const frame = isTab(initial)
      ? requestAnimationFrame(() => {
          select(initial);
          rootRef.current?.scrollIntoView({ block: "start" });
        })
      : 0;

    // Клик по ссылке-якорю вкладки. Ловим сами, а не ждём hashchange: при
    // повторном клике по тому же якорю он не приходит, и кнопка «молчала бы».
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      const key = a?.getAttribute("href")?.slice(1) ?? "";
      if (!isTab(key)) return;
      e.preventDefault();
      select(key);
      history.replaceState(null, "", `#${key}`);
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    document.addEventListener("click", onClick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return (
    // scroll-mt — чтобы полоса вкладок не пряталась под прилипшей шапкой.
    <div ref={rootRef} className="scroll-mt-20">
      <TabBar
        tabs={SHOP_TABS.map((key) => ({ key, label: labels[key], Icon: TAB_ICON[key] }))}
        active={active}
        onSelect={(key) => select(key as ShopTabKey)}
        idPrefix="shop"
        ariaLabel={ariaLabel}
      />
      {SHOP_TABS.map((key) => (
        <div
          key={key}
          id={`shop-panel-${key}`}
          role="tabpanel"
          aria-labelledby={`shop-tab-${key}`}
          hidden={key !== active}
          className={touched ? "animate-page-in" : ""}
        >
          {panels[key]}
        </div>
      ))}
    </div>
  );
}
