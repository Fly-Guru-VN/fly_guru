import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// robots.txt — правила для поисковых роботов. Next отдаёт его по /robots.txt.
//
// Зачем: у сайта половина адресов — это CRM (кабинеты админа, инструктора,
// механика). Они и так закрыты логином, но роботу незачем даже стучаться:
// каждый заход — лишний запрос к нашей базе, а обрывки таких адресов иногда
// всплывают в выдаче. Публичные страницы при этом индексируются свободно.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/instructor",
        "/mechanic",
        "/agent",
        "/member",
        "/login",
        "/invite",
        "/api",
        "/thanks", // страница «спасибо» после заявки — в выдаче ей не место
        "/diag", // служебная страница-диагност для телефонов сотрудников
        "/r/", // персональные реф-ссылки: их раздают адресно, а не через поиск
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
