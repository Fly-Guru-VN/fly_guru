import type { Metadata } from "next";
import { Container, Section, SectionHeading, Card, Button } from "@/components/ui";
import { Media } from "@/components/Media";
import { formatVnd, formatDuration } from "@/content/services";
import { BookBtn } from "@/components/BookBtn";
import { getActiveServices, getSiteServices, pickService } from "@/lib/services";

export const metadata: Metadata = { title: "Тандем" };
export const dynamic = "force-static"; // статичная страница, форсим SSG

export default async function TandemPage() {
  // Услуги тандема из базы (с настоящими id) — для формы записи;
  // цены карточек — тоже из базы (правятся в админке, /admin/services).
  const [services, site] = await Promise.all([
    getActiveServices("tandem"),
    getSiteServices(),
  ]);

  const options = [
    pickService(site, "tandem-adult"),
    pickService(site, "tandem-kid"),
  ];

  return (
    <>
      <Section className="pt-10 sm:pt-14">
        <Container>
          {/* Кадр вертикальный, поэтому колонка под него уже, чем текстовая. */}
          <div className="grid items-center gap-10 md:grid-cols-12">
            <div className="md:col-span-7">
              <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary">
                Полёт в тандеме
              </p>
              <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
                Попробуйте полёт за 10 минут
              </h1>
              <p className="mt-4 max-w-lg text-lg text-muted">
                Самый простой способ понять, что такое электрофойл. Вы садитесь на доску
                вместе с инструктором и уже через минуту летите над водой — без подготовки
                и обязательств.
              </p>
              <div className="mt-8">
                <BookBtn serviceId={services[0]?.id} place="tandem-hero" size="lg">
                  Записаться на тандем
                </BookBtn>
              </div>
            </div>
            {/* Кадр снят вертикально — родные 9:16, иначе object-cover срежет
                инструктора сверху и доску снизу. */}
            <Media
              src="/media/photo/tandem-hero.webp"
              alt="Тандемный полёт на электрофойле: гостья и инструктор на одной доске"
              ratio="9/16"
              priority
              className="mx-auto max-w-[340px] md:col-span-5"
              sizes="340px"
            />
          </div>
        </Container>
      </Section>

      <Section tone="muted">
        <Container>
          <SectionHeading eyebrow="Цены" title="10 минут полёта" />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 md:max-w-2xl">
            {options.map((s) => (
              <Card key={s.id}>
                <h3 className="text-lg font-bold">{s.name}</h3>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-primary">{formatVnd(s.price)}</span>
                  <span className="text-sm text-muted">/ {formatDuration(s)}</span>
                </div>
                <div className="mt-6">
                  <BookBtn
                    serviceId={services.find((x) => x.name === s.name)?.id}
                    place="tandem-price"
                    variant="secondary"
                    className="w-full"
                  >
                    Записаться
                  </BookBtn>
                </div>
              </Card>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted">
            Тандем — это проба, он не даёт членства в клубе. Готовы двигаться дальше?{" "}
            <Button href="/training" variant="ghost">Перейти к обучению</Button>
          </p>
        </Container>
      </Section>

      {/* Галерея тандемов */}
      <Section>
        <Container>
          <SectionHeading eyebrow="Как это проходит" title="Летают все — от детей до взрослых" />
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <Media
              src="/media/photo/tandem-rebenok-gor.webp"
              alt="Тандемный полёт с ребёнком в спасательном жилете и шлеме"
              ratio="3/4"
              sizes="(min-width: 640px) 33vw, 100vw"
            />
            <Media
              src="/media/photo/tandem-2.webp"
              alt="Гостья на электрофойле в тандеме с инструктором"
              ratio="3/4"
              sizes="(min-width: 640px) 33vw, 100vw"
            />
            <Media
              src="/media/photo/tandem-rebenok.webp"
              alt="Ребёнок летит над водой на электрофойле с инструктором"
              ratio="3/4"
              sizes="(min-width: 640px) 33vw, 100vw"
            />
          </div>
        </Container>
      </Section>

    </>
  );
}
