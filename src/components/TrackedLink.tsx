"use client";

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { trackEvent, type EventData, type SiteEvent } from "@/lib/analytics";

// Ссылка, которая перед переходом отмечается в аналитике.
//
// Зачем отдельный компонент: обычные <Button> и <a> живут в серверных
// компонентах, а обработчик клика бывает только на клиенте. Оборачивать ради
// этого весь ui.tsx в «use client» нельзя — тогда клиентскими станут и
// Container с Section, то есть половина сайта. Поэтому точечная замена там,
// где клик действительно надо считать.
//
// external — внешние адреса (tel:, wa.me, карты, соцсети): обычный <a>, без
// клиентской навигации. Внутренние ссылки идут через локале-осведомлённый Link,
// иначе потеряется префикс языка.
export function TrackedLink({
  href,
  event,
  data,
  external = false,
  newTab = false,
  className = "",
  ariaLabel,
  children,
}: {
  href: string;
  event: SiteEvent;
  data?: EventData;
  external?: boolean;
  // Открывать в новой вкладке (карта, соцсети). rel проставляем сами: без
  // noopener чужая страница получает доступ к нашей вкладке.
  newTab?: boolean;
  className?: string;
  // Подпись для скринридера — когда содержимое ссылки само по себе непонятно
  // (плашка с оценкой на /reviews — это «4,9» и пять звёздочек, вслух это
  // просто число).
  ariaLabel?: string;
  children: ReactNode;
}) {
  // Событие уходит «в фоне» (sendBeacon внутри аналитики), переход не ждём —
  // иначе клик по телефону подтормаживал бы на глазах у гостя.
  const onClick = () => trackEvent(event, data);

  if (external) {
    return (
      <a
        href={href}
        onClick={onClick}
        className={className}
        aria-label={ariaLabel}
        {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} onClick={onClick} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}
