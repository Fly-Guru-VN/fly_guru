import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Container, Section } from "@/components/ui";
import { BookingForm } from "@/components/BookingForm";
import { LinkMark } from "@/components/LinkMark";
import { LINK_TAG_RE } from "@/lib/channels";
import { getActiveServices } from "@/lib/services";
import { getService } from "@/content/services";

// Короткая ссылка СРАЗУ НА ЗАПИСЬ: flyguru.vn/b/instagram.
//
// Просьба от 12.08.2026: рядом с обычными рекламными ссылками нужны такие, что
// ведут прямо к форме, где человек вводит данные. Обычная /i/<метка> открывает
// главную, и до формы гостю ещё надо доскроллить или нажать кнопку; эта ссылка
// экономит оба шага — годится для «Записаться» в шапке профиля и для кнопки под
// роликом.
//
// Метку ставим тем же LinkMark, что и на /i, но адрес НЕ чистим: здесь он
// короткий, человеческий и ведёт именно туда, где гость стоит. Заявка увезёт
// метку сама — форма читает её из браузера (lib/attribution).

export const metadata: Metadata = {
  // Посадочная под рекламу: гость приходит по ссылке, а не из поиска.
  robots: { index: false, follow: true },
  // Без «· FlyGuru» в строке: шаблон заголовка из layout допишет его сам.
  title: "Запись на полёт",
  description:
    "Оставьте заявку на полёт на электрофойле в Нячанге — перезвоним и подберём время.",
};

export default async function TaggedBookingPage({
  params,
}: {
  params: Promise<{ locale: string; src: string }>;
}) {
  const { locale, src } = await params;
  setRequestLocale(locale);

  if (!LINK_TAG_RE.test(src)) notFound();

  // Услуги те же, что в модалке записи на сайте, и предвыбор тот же —
  // «взрослый базовый»: за ним приходит подавляющее большинство.
  const services = await getActiveServices();
  const defaultServiceId = services.find(
    (s) => s.name === getService("basic-adult").name,
  )?.id;

  return (
    <>
      <LinkMark src={src} />

      <Section className="pt-10 sm:pt-14">
        <Container>
          <div className="mx-auto max-w-lg">
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
              Запись на полёт
            </h1>
            <p className="mt-3 text-lg text-muted">
              Заполните два поля — перезвоним, подберём время и ответим на
              вопросы. Ничего платить сейчас не нужно.
            </p>
            <div className="mt-8 rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-8">
              <BookingForm services={services} defaultServiceId={defaultServiceId} />
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
