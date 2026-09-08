import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container, Section, Button } from "@/components/ui";
import { BookingNo } from "./BookingNo";

export const dynamic = "force-static"; // статичная страница, форсим SSG

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Thanks" });
  return { title: t("metaTitle") };
}

// Страница «спасибо». Сюда форма перенаправляет человека после успешной отправки
// заявки. Задача — успокоить («мы получили заявку») и сказать, что будет дальше.
export default async function ThanksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Thanks");

  return (
    <Section className="pt-16 sm:pt-24">
      <Container>
        <div className="mx-auto max-w-xl text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-3xl">
            ✅
          </div>
          <h1 className="text-3xl font-bold sm:text-4xl">{t("title")}</h1>
          <BookingNo />
          <p className="mt-4 text-lg text-muted">{t("text")}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button href="/">{t("home")}</Button>
            <Button href="/training" variant="secondary">
              {t("training")}
            </Button>
          </div>
        </div>
      </Container>
    </Section>
  );
}
