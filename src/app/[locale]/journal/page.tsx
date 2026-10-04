import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container, Section } from "@/components/ui";
import { JournalCard } from "@/components/journal/JournalCard";
import { getPublishedPosts } from "@/lib/journalData";
import { ogMeta } from "@/lib/og";
import { SITE_URL } from "@/lib/site";

// Лента журнала. Посты лежат в базе, а не в коде: пишут их админ и СММщик из
// кабинета, без разработчика и без деплоя.
//
// Страница статичная, как весь сайт, но не «до следующего деплоя»: публикация
// в кабинете сама сбрасывает её кэш (revalidatePath в admin/journal/actions),
// и следующий посетитель получает свежую ленту. revalidate — страховка на
// случай, если сброс почему-то не дошёл.
export const dynamic = "force-static";
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Journal" });
  const title = t("metaTitle");
  const description = t("metaDescription");
  return {
    title: { absolute: title },
    description,
    // Посты пока только на русском, поэтому настоящая страница журнала одна —
    // русская. /en/journal показывает те же русские посты в английской
    // обвязке; canonical говорит поисковику не считать её отдельной страницей.
    // Языковых alternates нет: переводов пока не существует.
    alternates: { canonical: `${SITE_URL}/journal` },
    ...ogMeta({ locale, title, description }),
  };
}

export default async function JournalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, posts] = await Promise.all([
    getTranslations("Journal"),
    getPublishedPosts(),
  ]);

  return (
    <>
      <section className="bg-gradient-to-b from-white to-surface-2">
        <Container className="pb-10 pt-8 lg:pb-14 lg:pt-12">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl lg:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-3 max-w-2xl text-muted sm:text-lg">{t("subtitle")}</p>
          {locale !== "ru" && (
            <p className="mt-3 text-sm font-semibold text-primary">{t("readingLanguage")}</p>
          )}
        </Container>
      </section>

      <Section pad="tight">
        <Container>
          {posts.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-line p-8 text-center text-muted">
              {t("empty")}
            </p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <JournalCard key={post.slug} post={post} />
              ))}
            </div>
          )}
        </Container>
      </Section>
    </>
  );
}
