import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// sitemap.xml — список страниц, которые мы САМИ предлагаем поисковику. Next
// отдаёт его по /sitemap.xml, ссылка на него стоит в robots.ts.
//
// Перечисляем только живые публичные страницы. Заглушки (/shop и карточки
// товаров — наполнение на Этапе 6) сюда не берём: пустая страница в выдаче
// хуже, чем её отсутствие. Кабинеты и /thanks закрыты в robots.ts.
//
// priority — относительная важность внутри нашего же сайта (подсказка, не
// приказ). changeFrequency — как часто содержимое реально меняется.
const PAGES: { path: string; priority: number; changeFrequency: "weekly" | "monthly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/training", priority: 0.9, changeFrequency: "monthly" },
  { path: "/tandem", priority: 0.8, changeFrequency: "monthly" },
  { path: "/prices", priority: 0.8, changeFrequency: "weekly" },
  { path: "/club", priority: 0.6, changeFrequency: "monthly" },
  { path: "/reviews", priority: 0.6, changeFrequency: "weekly" },
  { path: "/contacts", priority: 0.5, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
