import type { ReactNode } from "react";
import { ShopDevLock } from "@/components/shop/ShopDevLock";
import { SHOP_IN_DEVELOPMENT } from "@/content/shop";

// Общая обёртка магазина: пока он в разработке, и каталог, и карточки товаров
// гость видит под замком (см. ShopDevLock). Одно место на весь раздел — чтобы
// новая страница магазина не оказалась случайно открытой.
export default function ShopLayout({ children }: { children: ReactNode }) {
  return SHOP_IN_DEVELOPMENT ? <ShopDevLock>{children}</ShopDevLock> : children;
}
