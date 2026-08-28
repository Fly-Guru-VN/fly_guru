// Пункты основной навигации. Используются и в шапке, и в футере.
export const NAV_LINKS = [
  { href: "/training", label: "Обучение" },
  { href: "/tandem", label: "Тандем" },
  { href: "/club", label: "Клуб" },
  { href: "/shop", label: "Магазин" },
  { href: "/prices", label: "Прайс" },
  { href: "/reviews", label: "Отзывы" },
  { href: "/contacts", label: "Контакты" },
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
  { href: "/training", label: "Обучение", icon: "foil" },
  { href: "/tandem", label: "Тандем", icon: "tandem" },
  { href: "/club", label: "Клуб", icon: "club" },
  { href: "/prices", label: "Прайс", icon: "tag" },
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
