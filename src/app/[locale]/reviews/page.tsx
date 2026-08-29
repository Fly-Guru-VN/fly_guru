import { Fragment } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { Container, Section, buttonClasses } from "@/components/ui";
import { Squiggle } from "@/components/Squiggle";
import { Marquee } from "@/components/Marquee";
import { RailItem } from "@/components/Rail";
import { DotsRail } from "@/components/DotsRail";
import { ReviewCard } from "@/components/ReviewCard";
import { ReviewPhotoCard } from "@/components/ReviewPhotoCard";
import { GoogleMapsLink, IconGoogleMapsPin } from "@/components/GoogleMapsLink";
import { BookBtn } from "@/components/BookBtn";
import { TrackedLink } from "@/components/TrackedLink";
import { IconStar, IconArrowRight } from "@/components/icons";
import { reviews } from "@/content/reviews";
import { contacts } from "@/content/contacts";

export const metadata: Metadata = { title: "Отзывы" };
export const dynamic = "force-static"; // статичная страница, форсим SSG

// Страница отзывов собрана тем же языком, что обучение, тандем и клуб: кадр во
// весь экран, бегущая строка, дальше — блоки без лишнего текста.
//
// Порядок продуман как чтение чужого опыта: сначала оценка школы целиком
// (сколько людей и какая средняя), потом три развёрнутых истории с
// фотографиями тех самых занятий, потом одна фраза крупно — та, ради которой
// всё и затевалось, — и только потом остальные отзывы кладкой.

// Оценка школы в Google Maps. Вписана руками: живьём её отдаёт только Places
// API, а он требует привязанной банковской карты, которой у школы нет.
//
// Поэтому цифра здесь округлена ВНИЗ и не устаревает: отзывов со временем
// только прибавляется, и «более 170» останется правдой и через год. Точное,
// всегда свежее число видно ниже на этой же странице — в блоке с настоящей
// карточкой Google, где плашку рисует сам Google.
//
// Проверено 24.08.2026: 4,9 и 176 отзывов. Захотите освежить — правьте эти две
// строки, больше нигде цифра не встречается.
const GOOGLE_RATING = { value: "4,9", count: "более 170 отзывов" };

// Короткие куски настоящих отзывов — для бегущей строки. Только то, что
// человек действительно написал, без придуманных лозунгов.
const QUOTES = [
  "«Полетели с первого раза»",
  "«Дочка была в полном восторге»",
  "«Стоит каждого заплаченного донга»",
  "«Куча впечатлений»",
  "«Непередаваемые эмоции»",
  "«Инструктор всё спокойно объяснял»",
];

// Три коротких отзыва плашками на первом экране. Фразы вырезаны из настоящих
// отзывов дословно (полные тексты — ниже на этой же странице).
//
// Аватарки вместо фотографий — кружок с первой буквой имени, как рисует их сам
// Google тем, у кого в профиле нет снимка. Цвет Google считает от аккаунта, и
// снаружи его не вычислить: здесь взяты цвета из его же палитры монограмм.
// Если сверить со скриншотами отзывов — правьте color, больше нигде не всплывёт.
const HERO_CHIPS = [
  { name: "Polina Shchegoleva", text: "Полетели с первого раза", rating: 5, color: "#1a73e8" },
  { name: "Евгений Курьянов", text: "Обязательно повторим!", rating: 5, color: "#1e8e3e" },
  { name: "Илья Яковлев", text: "Непередаваемые эмоции!", rating: 5, color: "#9334e6" },
];

// Фраза для крупной врезки. Вырезана из отзыва Полины дословно — врезка не
// пересказывает отзыв, а цитирует его.
const PULL_QUOTE = {
  name: "Полина Черненькая",
  text: "Я уже вернулась в Россию, но до сих пор живу воспоминаниями об этом уроке. Это был один из самых ярких моментов поездки!",
};

// Возле какого отзыва встаёт плашка «читать все» — см. комментарий у неё
// самой в разметке.
const MORE_CTA_AFTER = "Илья Яковлев";

export default function ReviewsPage() {
  // С фотографиями — истории целиком, остальные — кладкой ниже.
  const withPhoto = reviews.filter((r) => r.photo);
  const rest = reviews.filter((r) => !r.photo);

  const pull = reviews.find((r) => r.name === PULL_QUOTE.name);

  return (
    <>
      {/* ── Первый экран ── */}
      {/* Собран по макету hero_png (1282×886 после обрезки прозрачных полей):
          до lg кадр идёт полосой во всю ширину, текст под ним; от lg кадр
          уходит в правый край окна, а текст занимает левую половину — тот же
          приём, что на прайсе и тандеме.

          Section тут не используется: у первого экрана свои поля, кадр должен
          вставать встык под шапку. Фон градиентом в surface-2, чтобы стык с
          бегущей строкой ниже не читался ступенькой.

          Кадр по центру высоты (items-center), а не встык к шапке: текста в
          левой колонке больше, чем высоты фотографии, и при верхнем
          выравнивании под кадром зияла пустая полоса в треть экрана.

          min-h на ПК — ровно высота кадра: 52% ширины окна, делённые на
          пропорцию файла 1282/886, то есть 35.9vw. Кадр лежит absolute и
          высоту секции не задаёт; её задавал текст, и от 1600 px фотография
          становилась выше текста — overflow-hidden срезал ей и волну снизу, и
          верхнюю плашку с отзывом (мерил 29.08.2026). Меняете долю кадра или
          файл — пересчитайте и это число. */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white to-surface-2 lg:flex lg:min-h-[35.9vw] lg:items-center">
        {/* Чайки — как на прайсе. Обе слева: правую половину от lg занимает
            кадр, а ниже lg он идёт во всю ширину и чайка легла бы на воду.
            От xl, а не от lg: до 1280 px контейнер прижат к краям окна, и
            птица садилась прямо на заголовок (проверено на 1024). */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden xl:block">
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute left-6 top-24 w-14 -rotate-[7deg] opacity-90"
          />
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute left-2 top-48 w-[4.5rem] rotate-[5deg] opacity-80"
          />
        </div>

        {/* Кадры и плашки. Обе фотографии — PNG со своими краями: у большой
            зашиты скруглённый левый угол и волна снизу, у малой — белая
            обводка по фигурной форме. Ни подложек, ни масок им не нужно,
            прозрачные края показывают фон страницы.
            52% — доля кадра от ширины ОКНА, ровно как на прайсе. Число решает
            всё: контейнер с текстом (max-w-6xl) с ростом окна отъезжает вправо
            со скоростью половины ширины, а левый край кадра — со скоростью
            (1 − доля). При 54% они сходились и на 1920 текст уже лез на
            фотографию (мерил 29.08.2026); при 52% зазор держится хоть на 2560.
            Меняете долю — перемеряйте на широких экранах. */}
        <div className="lg:absolute lg:inset-y-0 lg:right-0 lg:flex lg:w-[52%] lg:items-center">
          <div className="relative w-full">
            <Image
              src="/media/photo/reviews/hero.webp"
              alt="Семья с электрофойлами на пляже в Нячанге после занятия с FlyGuru"
              width={1282}
              height={886}
              priority
              quality={90}
              sizes="(min-width: 1024px) 54vw, 100vw"
              className="h-auto w-full"
            />

            {/* Малый кадр внахлёст — доли от ширины большого, чтобы наложение
                держалось на любой ширине окна. */}
            <Image
              src="/media/photo/reviews/hero-small.webp"
              alt="Девочка самостоятельно едет на электрофойле рядом с инструктором"
              width={1144}
              height={872}
              quality={90}
              sizes="(min-width: 1024px) 28vw, 50vw"
              className="absolute left-[36%] top-[38%] h-auto w-[50%]"
            />

            {/* Три коротких отзыва плашками поверх кадра.
                Только от lg: на телефоне кадр идёт полосой во всю ширину, и
                плашки поверх него легли бы на лица. Ничего при этом не
                теряется — ровно эти же фразы едут в бегущей строке сразу под
                первым экраном. */}
            <ul className="absolute right-[2%] top-[6%] hidden w-[34%] flex-col gap-2.5 lg:flex">
              {HERO_CHIPS.map((c) => (
                <li
                  key={c.name}
                  className="flex items-center gap-2.5 rounded-2xl bg-white/95 p-2.5 shadow-[0_16px_34px_-22px_rgba(15,34,51,0.6)] backdrop-blur-sm xl:gap-3 xl:p-3"
                >
                  {/* Аватарка — кружок с первой буквой имени, как это рисует
                      сам Google тем, у кого в профиле нет фотографии. */}
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white xl:h-9 xl:w-9 xl:text-base"
                    style={{ backgroundColor: c.color }}
                  >
                    {c.name[0]}
                  </span>
                  <span className="min-w-0">
                    <span className="flex gap-0.5 text-accent" aria-hidden>
                      {Array.from({ length: c.rating }).map((_, i) => (
                        <IconStar key={i} className="h-3 w-3 xl:h-3.5 xl:w-3.5" />
                      ))}
                    </span>
                    <span className="mt-0.5 block text-[0.72rem] font-semibold leading-tight xl:text-sm">
                      {c.text}
                    </span>
                    <span className="sr-only">— {c.name}, отзыв в Google Maps</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Container className="relative">
          <div className="pb-10 pt-8 lg:max-w-[46%] lg:py-14">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              Отзывы
            </p>
            <Squiggle className="mt-3" />
            {/* Размер подобран так, чтобы вторая строка («каждому гостю
                улыбку!») влезала в колонку целиком: она длиннее первой, а
                колонка — 46% контейнера. С text-5xl на 1440 её срывало на
                третью строку (мерил 29.08.2026). */}
            <h1 className="mt-5 text-3xl font-bold leading-[1.1] sm:text-4xl lg:text-[2rem] xl:text-[2.5rem]">
              Стараемся подарить
              <br />
              каждому гостю улыбку!
            </h1>
            <p className="mt-5 max-w-md text-muted">
              Более 170 гостей уже поделились впечатлениями о FlyGuru.
            </p>

            {/* Оценка плашкой. Плашка — ссылка, а не картинка: она выглядит как
                кнопка, в неё и так тыкают пальцем, поэтому ведёт туда же, куда
                кнопка под ней, — в отзывы на карточке школы. Своё событие
                аналитики (place «reviews-rating»), чтобы было видно, по чему
                именно жмут: по плашке или по кнопке. */}
            <TrackedLink
              href={contacts.mapReviewsLink}
              external
              newTab
              event="contact_click"
              data={{ channel: "maps", place: "reviews-rating" }}
              ariaLabel={`Оценка ${GOOGLE_RATING.value} из 5, ${GOOGLE_RATING.count} — читать в Google Maps`}
              className="mt-8 flex max-w-md items-center gap-4 rounded-2xl bg-surface p-5 shadow-[0_20px_44px_-26px_rgba(15,34,51,0.55)] transition hover:shadow-[0_24px_50px_-24px_rgba(15,34,51,0.6)] active:scale-[0.99] sm:gap-5"
            >
              <span className="text-4xl font-bold leading-none sm:text-5xl">
                {GOOGLE_RATING.value}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex gap-1 text-accent" aria-hidden>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <IconStar key={i} className="h-5 w-5" />
                  ))}
                </span>
                <span className="mt-1.5 block text-sm font-semibold text-muted">
                  {GOOGLE_RATING.count} в Google Maps
                </span>
              </span>
              <IconGoogleMapsPin className="h-9 w-9 shrink-0 sm:h-10 sm:w-10" />
            </TrackedLink>

            {/* «Читать отзывы» — значит сразу отзывы, а не карточка целиком. */}
            <div className="mt-6">
              <TrackedLink
                href={contacts.mapReviewsLink}
                external
                newTab
                event="contact_click"
                data={{ channel: "maps", place: "reviews-hero" }}
                className={buttonClasses({ size: "lg", className: "w-full sm:w-auto" })}
              >
                Читать отзывы в Google Maps
              </TrackedLink>
            </div>
          </div>
        </Container>
      </section>

      <Marquee items={QUOTES} />

      {/* ── Три истории с фото ── */}
      {/* Заголовка и подписи у блока нет намеренно: карточки идут сразу за
          первым экраном и читаются как его продолжение — три отзыва с
          фотографиями тех самых занятий. Объяснять словами, что это отзывы,
          после экрана с крупной надписью «Отзывы» было нечего. */}
      <Section pad="tight" className="bg-gradient-to-b from-white to-surface-2">
        <Container>
          {/* Лента: на телефоне листается пальцем, на ПК — три колонки. Та же,
              что в блоке отзывов на главной, только текст здесь не обрезаем. */}
          <DotsRail count={withPhoto.length} className="md:grid-cols-3">
            {withPhoto.map((r) => (
              <RailItem key={r.name}>
                <ReviewPhotoCard review={r} clamp={false} />
              </RailItem>
            ))}
          </DotsRail>
        </Container>
      </Section>

      {/* ── Врезка ── */}
      {/* Одна фраза крупно: после трёх длинных карточек глазу нужна пауза, а
          странице — та строчка, которую запомнят. */}
      <Section pad="tight" className="bg-surface-2">
        <Container>
          <figure className="relative mx-auto max-w-3xl px-4 text-center sm:px-10">
            <span
              aria-hidden
              className="pointer-events-none absolute -top-8 left-0 select-none font-serif text-[9rem] leading-none text-primary/10 sm:-top-10 sm:text-[12rem]"
            >
              &ldquo;
            </span>
            <blockquote className="relative text-xl font-bold leading-snug sm:text-2xl md:text-3xl">
              {PULL_QUOTE.text}
            </blockquote>
            <figcaption className="relative mt-6 flex items-center justify-center gap-3">
              {pull?.avatar && (
                <Image
                  src={pull.avatar}
                  alt=""
                  aria-hidden
                  width={96}
                  height={96}
                  className="h-11 w-11 rounded-full object-cover"
                />
              )}
              <span className="text-left">
                <span className="block font-semibold leading-tight">{PULL_QUOTE.name}</span>
                {pull?.sourceUrl && <GoogleMapsLink href={pull.sourceUrl} />}
              </span>
            </figcaption>
          </figure>
        </Container>
      </Section>

      {/* ── Остальные отзывы ── */}
      <Section pad="tight" className="bg-gradient-to-b from-surface-2 to-white">
        <Container>
          <h2 className="text-3xl font-bold sm:text-4xl">Больше отзывов</h2>
          <Squiggle long className="mt-4" />

          {/* Кладка (CSS columns), а не сетка: отзывы разной длины, и в сетке
              под короткой карточкой оставалась дыра в полстолбца. В кладке
              карточки идут встык, а порядок чтения сверху вниз по колонке —
              для несвязанных между собой отзывов это нормально. */}
          <div className="mt-8 gap-5 sm:columns-2 lg:columns-3 [&>figure]:mb-5">
            {rest.map((r) => (
              <Fragment key={r.name}>
                <ReviewCard review={r} />
                {r.name === MORE_CTA_AFTER && (
                  // Плашка «читать все» — ровно в ту дыру, которую кладка
                  // оставляла внизу средней колонки: отзывы разной длины,
                  // колонки выравниваются по высоте, и средняя кончалась на
                  // 260 px раньше соседних (мерил 29.08.2026).
                  //
                  // Место задано именем соседа, а не номером в массиве:
                  // отзывы в reviews.ts добавляют сверху, и номер уехал бы.
                  // Добавите отзывов — перепроверьте, где теперь дыра.
                  <div className="mb-5 break-inside-avoid overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-strong p-6 text-center text-white shadow-[0_18px_40px_-30px_rgba(15,34,51,0.5)]">
                    <span aria-hidden className="flex justify-center gap-1 text-accent">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <IconStar key={i} className="h-5 w-5" />
                      ))}
                    </span>
                    <p className="mt-3 text-lg font-bold leading-tight">
                      Это не все отзывы
                    </p>
                    <p className="mt-2 text-sm text-white/90">
                      В Google их {GOOGLE_RATING.count.replace("более ", "больше ")} — все
                      от настоящих гостей школы.
                    </p>
                    <TrackedLink
                      href={contacts.mapReviewsLink}
                      external
                      newTab
                      event="contact_click"
                      data={{ channel: "maps", place: "reviews-more" }}
                      className={buttonClasses({ variant: "light", className: "mt-5 w-full" })}
                    >
                      Читать все в Google Maps
                    </TrackedLink>
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </Container>
      </Section>

      {/* ── Где мы находимся ── */}
      {/* Заодно здесь живёт всегда свежая цифра: плашку с оценкой и точным
          числом отзывов рисует сам Google внутри карты. Вырезать из неё одну
          плашку и повесить на первый экран нельзя — высота плашки скачет от
          ширины карты, и при 800 px строчка с оценкой уходит за край обрезки
          (мерил 24.08.2026). Поэтому карта стоит целиком, как ей и положено. */}
      <Section pad="tight" className="bg-white">
        <Container>
          <h2 className="text-3xl font-bold sm:text-4xl">Где мы находимся</h2>
          <Squiggle long className="mt-4" />
          <p className="mt-5 max-w-2xl text-muted">
            Наша база находится в тихой и спокойной бухте. Даже в дождливый
            сезон у нас спокойное море, так что мы можем круглый год обучать вас
            кататься на фойлах.
          </p>

          <div className="mt-8 overflow-hidden rounded-3xl border border-line shadow-[0_18px_40px_-30px_rgba(15,34,51,0.5)]">
            <iframe
              title="Карточка FlyGuru в Google Maps — оценка и отзывы"
              src={contacts.mapEmbed}
              className="h-[320px] w-full sm:h-[420px]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </Container>
      </Section>

      {/* ── Свой отзыв ── */}
      <Section pad="tight" className="bg-gradient-to-b from-white to-surface-2">
        <Container>
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-strong px-6 py-10 text-center text-white shadow-[0_24px_50px_-30px_rgba(15,34,51,0.6)] sm:px-10 sm:py-12">
            <span aria-hidden className="mx-auto flex justify-center gap-1 text-accent">
              {Array.from({ length: 5 }).map((_, i) => (
                <IconStar key={i} className="h-6 w-6" />
              ))}
            </span>
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl">Уже катались с нами?</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/90">
              Будем рады вашему отзыву на Google Maps.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {/* Ведём в карточку школы, а не на /contacts: человек дочитал
                  чужие отзывы, и это ровно тот момент, когда пишут свой. Раньше
                  здесь была ссылка на контакты, а оттуда карта вела на Maryna
                  Beach Club — то есть отзыв уходил чужому бизнесу. */}
              <TrackedLink
                href={contacts.mapLink}
                external
                newTab
                event="contact_click"
                data={{ channel: "maps", place: "reviews" }}
                className={buttonClasses({ size: "lg", className: "w-full sm:w-auto" })}
              >
                Оставить отзыв
                <IconArrowRight aria-hidden className="h-4 w-4" />
              </TrackedLink>
              <BookBtn place="reviews-cta" variant="light" size="lg" className="w-full sm:w-auto">
                Записаться
              </BookBtn>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
