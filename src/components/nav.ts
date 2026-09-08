// Пункты основной навигации. Используются и в шапке, и в футере.
//
// Подписи здесь не лежат: сайт говорит на семи языках, и текст пункта берётся
// по ключу из messages (раздел Nav). Ключ совпадает с адресом без слэша —
// отдельное поле было бы третьим местом, которое надо не забыть поправить.
export const NAV_LINKS = [
  { href: "/training", key: "training" },
  { href: "/tandem", key: "tandem" },
  { href: "/club", key: "club" },
  { href: "/shop", key: "shop" },
  { href: "/prices", key: "prices" },
  { href: "/reviews", key: "reviews" },
  { href: "/contacts", key: "contacts" },
] as const;

// Вкладки нижней панели на телефоне (MobileTabBar). Четыре раздела, которые
// открывают чаще всего, — их же листает свайп влево/вправо (SwipeNav), поэтому
// порядок здесь = порядок пролистывания. Пятой вкладкой в панели стоит
// оранжевая кнопка записи, она не раздел и в этом списке её нет.
//
// Почему не все семь пунктов меню: подписи в панели 11px, при пяти вкладках
// «Обучение» уже обрезается многоточием на 360px (те же грабли, что в
// кабинетах). Магазин, Отзывы и Контакты остаются в бургере шапки.
export const MOBILE_TABS = [
  { href: "/training", key: "training", icon: "foil" },
  { href: "/tandem", key: "tandem", icon: "tandem" },
  { href: "/club", key: "club", icon: "club" },
  { href: "/prices", key: "prices", icon: "tag" },
] as const;

// Разделы, где нижней панели быть не должно: у каждого кабинета своя такая же
// панель внизу (CabinetSidebar), две друг на друге — каша. Служебные экраны
// входа тоже без неё: там у человека одна задача.
export const NO_TAB_BAR_PREFIXES = [
  "/admin",
  "/instructor",
  "/smm",
  "/mechanic",
  "/agent",
  "/member",
  "/login",
  "/forgot-password",
  "/reset-password",
] as const;

// Разделы, которые открываются как Telegram Mini App. Там нет ни шапки сайта,
// ни подвала: заголовок с названием и крестиком рисует сам Telegram, а ссылки
// подвала уводили человека из кабинета на обычные страницы сайта прямо внутри
// бота — и вот они уже листаются свайпом вбок (David, 04.09.2026: «экран ездит
// в стороны»). Уйти на сайт можно кнопкой внутри самого кабинета.
export const MINI_APP_PREFIXES = ["/member"] as const;

export function isMiniAppPath(pathname: string): boolean {
  return MINI_APP_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
