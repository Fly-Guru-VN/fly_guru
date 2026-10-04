import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Container, buttonClasses } from "@/components/ui";
import { BookBtn } from "@/components/BookBtn";
import { IconArrowRight } from "@/components/icons";
import { JsonLd } from "@/components/JsonLd";
import { JournalArticle } from "@/components/journal/JournalArticle";
import { JournalCard } from "@/components/journal/JournalCard";
import { dayLong, vnDay } from "@/lib/dates";
import { excerpt, journalPhotoUrl, type JournalPhotoBlock } from "@/lib/journal";
import { getPublishedPost, getPublishedPosts, type JournalPost } from "@/lib/journalData";
import { ogMeta } from "@/lib/og";
import { journalPostSchema } from "@/lib/schema";
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
const RELATED_MAX = 3;

async function loadPost(slug: string) {
  // Мусорный адрес не стоит даже запроса в базу.
  return SLUG_RE.test(slug) ? getPublishedPost(slug) : null;
}

// Обложка поста с размерами — для превью в мессенджере и разметки Google.
// Нет фото — карточка раздела «Журнал» на языке страницы.
function coverOf(post: JournalPost) {
  const photo = post.body.find(
    (b): b is JournalPhotoBlock => b.type === "photo" && b.path === post.coverPath,
  );
  return photo ? { url: journalPhotoUrl(photo.path), width: photo.w, height: photo.h } : null;
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
    ...ogMeta({
      locale,
      title: post.title,
      description,
      page: "journal",
      cover: coverOf(post) ?? undefined,
      article: {
        publishedTime: post.publishedAt,
        modifiedTime: post.editedAt ?? post.publishedAt,
      },
    }),
  };
}

// «Читайте также»: сначала посты той же категории, затем самые свежие.
function relatedPosts(
  all: Awaited<ReturnType<typeof getPublishedPosts>>,
  post: JournalPost,
) {
  const others = all.filter((p) => p.slug !== post.slug);
  const same = post.category ? others.filter((p) => p.category === post.category) : [];
  const rest = others.filter((p) => !same.includes(p));
  return [...same, ...rest].slice(0, RELATED_MAX);
}

export default async function JournalPostPage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const post = await loadPost(slug);
  if (!post) notFound();

  const [t, tRu, all] = await Promise.all([
    getTranslations("Journal"),
    // Сама статья русская на всех языках сайта — и её служебные строки
    // (дата, «изменено», «Источник») тоже, иначе выходило «edited 4 октября».
    getTranslations({ locale: "ru", namespace: "Journal" }),
    getPublishedPosts(),
  ]);
  const related = relatedPosts(all, post);
  const url = `${SITE_URL}/journal/${post.slug}`;
  const cover = coverOf(post);

  return (
    <article className="pb-16 pt-8 lg:pt-12">
      <JsonLd
        data={journalPostSchema({
          url,
          title: post.title,
          description: excerpt(post.body, 160),
          image: cover?.url ?? `${SITE_URL}/og/journal/ru.jpg`,
          publishedAt: post.publishedAt,
          modifiedAt: post.editedAt ?? post.publishedAt,
          authorName: post.authorName,
        })}
      />
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
            sourceLabel={tRu("source")}
            editedAt={post.editedAt}
            editedText={
              post.editedAt ? tRu("edited", { date: dayLong(vnDay(post.editedAt)) }) : null
            }
          />

          {/* Переход к записи — после текста: дочитал до конца, значит
              интересно. Одна главная кнопка и одна спокойная ссылка. */}
          <aside className="mt-10 flex flex-col items-start gap-4 rounded-3xl bg-gradient-to-r from-primary/10 to-surface-2 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
            <div className="flex-1">
              <p className="text-lg font-bold">{t("ctaTitle")}</p>
              <p className="mt-1 text-sm text-muted">{t("ctaText")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <BookBtn place="journal">{t("ctaBook")}</BookBtn>
              <Link href="/training" className={buttonClasses({ variant: "secondary" })}>
                {t("ctaTraining")}
              </Link>
            </div>
          </aside>
        </div>

        {related.length > 0 && (
          <section className="mx-auto mt-14 max-w-6xl">
            <h2 className="text-2xl font-bold">{t("related")}</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => (
                <JournalCard key={p.slug} post={p} />
              ))}
            </div>
          </section>
        )}
      </Container>
    </article>
  );
}
