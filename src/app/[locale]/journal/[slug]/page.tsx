import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";
import { JournalArticle } from "@/components/journal/JournalArticle";
import { dayLong, vnDay } from "@/lib/dates";
import { excerpt } from "@/lib/journal";
import { getPublishedPost } from "@/lib/journalData";
import { ogMeta } from "@/lib/og";
import { SITE_URL } from "@/lib/site";

// Страница поста. Полный текст отдаётся готовым HTML — поисковый робот видит
// статью целиком, без JavaScript.
//
// Ни один пост не собирается при деплое (generateStaticParams пустой): пост
// рисуется при первом заходе и кэшируется. Публикация, правка и скрытие в
// кабинете сбрасывают кэш: скрытый пост отдаёт 404, правка видна посетителю.
// Сброс доходит не мгновенно — на next start замерено 4–5 секунд (04.10.2026):
// он применяется, когда ответ server action дописан целиком, а тот заодно
// перерисовывает страницу кабинета.
export const dynamic = "force-static";
export const dynamicParams = true;
export const revalidate = 300;

export function generateStaticParams() {
  return [];
}

type Params = Promise<{ locale: string; slug: string }>;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function loadPost(slug: string) {
  // Мусорный адрес не стоит даже запроса в базу.
  return SLUG_RE.test(slug) ? getPublishedPost(slug) : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await loadPost(slug);
  if (!post) return {};
  const description = excerpt(post.body, 160);
  return {
    title: post.title,
    description,
    // Пост существует только на русском: у /en/journal/<адрес> canonical
    // указывает на русскую страницу, иначе поисковик видел бы семь копий.
    alternates: { canonical: `${SITE_URL}/journal/${post.slug}` },
    ...ogMeta({ locale, title: post.title, description }),
  };
}

export default async function JournalPostPage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const post = await loadPost(slug);
  if (!post) notFound();

  const t = await getTranslations("Journal");

  return (
    <article className="pb-16 pt-8 lg:pt-12">
      {/* Колонка для чтения — не шире ~720 px: строка в полэкрана ноутбука
          читается тяжело. Ширину задаёт обёртка внутри: у Container свой
          max-w-6xl, и второй max-w на нём же проигрывает. */}
      <Container>
        <div className="mx-auto max-w-3xl">
          <Link
            href="/journal"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <IconArrowRight className="h-4 w-4 rotate-180" />
            {t("back")}
          </Link>

          <JournalArticle
            title={post.title}
            category={post.category}
            publishedAt={post.publishedAt}
            body={post.body}
            authorName={post.authorName}
            sourceName={post.sourceName}
            sourceUrl={post.sourceUrl}
            sourceLabel={t("source")}
            editedAt={post.editedAt}
            editedText={
              post.editedAt ? t("edited", { date: dayLong(vnDay(post.editedAt)) }) : null
            }
          />
        </div>
      </Container>
    </article>
  );
}
