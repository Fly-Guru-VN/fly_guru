"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { isMiniAppPath } from "./nav";

// Прячет обвязку сайта на страницах, которые открываются мини-приложением
// Telegram (см. MINI_APP_PREFIXES).
//
// Почему обёртка, а не проверка внутри самой шапки и подвала: подвал — серверный
// компонент, и ради одной проверки адреса его пришлось бы целиком уводить в
// браузер. Обёртка клиентская, а содержимое остаётся собранным на сервере: она
// лишь решает, показывать его или нет.
export function HideInMiniApp({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isMiniAppPath(pathname)) return null;
  return <>{children}</>;
}
