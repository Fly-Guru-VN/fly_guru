import type { MetadataRoute } from "next";
import { PREFIXED_LOCALES } from "@/i18n/locales";
import { SITE_URL } from "@/lib/site";

// robots.txt — правила для поисковых роботов. Next отдаёт его по /robots.txt.
//
// Зачем: у сайта половина адресов — это CRM (кабинеты админа, инструктора,
// механика). Они и так закрыты логином, но роботу незачем даже стучаться:
// каждый заход — лишний запрос к нашей базе, а обрывки таких адресов иногда
// всплывают в выдаче. Публичные страницы при этом индексируются свободно.
const PRIVATE_PATHS = [
  "/admin",
  "/instructor",
  "/mechanic",
  "/smm",
  "/agent",
  "/member",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/invite",
  "/thanks", // страница «спасибо» после заявки — в выдаче ей не место
  "/r/", // персональные реф-ссылки: их раздают адресно, а не через поиск
  // Короткие рекламные ссылки. /i/<метка> показывает ту же главную, и в
  // индексе это был бы её двойник; /b/<метка> — посадочная под рекламу,
  // из поиска на неё никто идти не должен.
  "/i/",
  "/b/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Каждый закрытый раздел закрываем и под языковым префиксом: /de/admin —
      // это тот же кабинет, и без второй строки робот полез бы именно туда.
      disallow: [
        "/api",
        ...PRIVATE_PATHS.flatMap((path) => [
          path,
          ...PREFIXED_LOCALES.map((locale) => `/${locale}${path}`),
        ]),
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
