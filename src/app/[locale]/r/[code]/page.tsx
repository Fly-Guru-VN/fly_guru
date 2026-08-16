import { setRequestLocale } from "next-intl/server";
import { Container, Section, SectionHeading, Card, Badge } from "@/components/ui";
import { Media } from "@/components/Media";
import { IconCheck } from "@/components/icons";
import { redirect } from "@/i18n/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveServices, getSiteServices, pickService } from "@/lib/services";
import { getService, formatVnd } from "@/content/services";
import { agentDiscountFor } from "@/lib/agentTerms";
import { BookBtn } from "@/components/BookBtn";
import { RefVisitLogger } from "@/components/RefVisitLogger";

// Реф-лендинг: гость приходит по личной ссылке /r/<код>. Ссылка бывает двух
// видов: агентская (даёт скидку на базовое и парное обучение, суммы — в
// lib/agentTerms) и инструкторская (без скидки, просто «пришёл к этому
// инструктору»). Страница динамическая — код проверяется в базе при каждом
// заходе, поэтому force-static здесь НЕ ставим.

type RefKind = "agent" | "instructor" | null;

// Что за код: активный агент, инструктор с личным кодом (пак C) — или мусор.
// (Реф-коды членов клуба появятся позже — Этап 5; здесь оставлен задел.)
async function resolveRefKind(code: string): Promise<RefKind> {
  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("ref_code", code)
    .eq("active", true)
    .maybeSingle();
  if (agent) return "agent";

  const { data: instructor } = await supabase
    .from("users")
    .select("id")
    .eq("ref_code", code)
    .eq("role", "instructor")
    .maybeSingle();
  if (instructor) return "instructor";

  return null;
}

export default async function ReferralLandingPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  setRequestLocale(locale);

  // Невалидный код (опечатка, устаревшая ссылка) — не показываем ошибку, а мягко
  // отправляем человека на обычную страницу обучения с обычной формой.
  const kind = await resolveRefKind(code);
  if (!kind) {
    redirect({ href: "/training", locale });
  }
  // Скидка — только по агентской ссылке. Инструкторская даёт прямую запись
  // к инструктору без скидки, поэтому скидочные блоки для неё прячем.
  const isAgent = kind === "agent";

  // Услуги обучения для формы + предвыбор «взрослый базовый».
  const services = await getActiveServices("training");
  const defaultServiceId = services.find(
    (s) => s.name === getService("basic-adult").name,
  )?.id;

  // Цены для блока скидки — из базы (их правят в админке), а не вписанные в
  // текст руками: раньше здесь стояло «2 000 000 → 1 800 000», и после первой
  // же правки прайса лендинг начал бы обещать неправду.
  const site = await getSiteServices();
  const basic = pickService(site, "basic-adult");
  const duo = pickService(site, "basic-duo");
  const discounted = (price: number | null, code: string) =>
    price === null ? null : Math.max(0, price - agentDiscountFor(code));

  return (
    <>
      {/* Невидимый помощник: запоминает код на 30 дней + пишет переход в статистику. */}
      <RefVisitLogger code={code} />

      {/* Герой */}
      <Section className="pt-10 sm:pt-14">
        <Container>
          <div className="grid items-center gap-10 md:grid-cols-12">
            <div className="md:col-span-7">
              <Badge>Приглашение по личной ссылке</Badge>
              <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">
                Полетите на электрофойле уже на первом занятии
              </h1>
              <p className="mt-4 max-w-lg text-lg text-muted">
                90% наших гостей встают на крыло и едут самостоятельно уже в первый раз.
                {isAgent
                  ? " По этой ссылке — специальная скидка на базовое занятие."
                  : " Запишитесь напрямую к вашему инструктору."}
              </p>
              <div className="mt-8">
                <BookBtn refCode={code} serviceId={defaultServiceId} place="ref-hero" size="lg">
                  {isAgent ? "Записаться со скидкой" : "Записаться"}
                </BookBtn>
              </div>
            </div>
            <Media
              src="/media/photo/ref-hero.webp"
              alt="Довольный гость FlyGuru на электрофойле"
              ratio="9/16"
              priority
              className="mx-auto max-w-[340px] md:col-span-5"
              sizes="340px"
            />
          </div>
        </Container>
      </Section>

      {/* Почему получится с первого раза */}
      <Section tone="muted">
        <Container>
          <SectionHeading eyebrow="Почему это легко" title="С нами получается сразу" />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Комфортные доски",
                text: "Устойчивые доски для новичков — на них проще поймать баланс и встать на крыло.",
              },
              {
                title: "Инструктор рядом на воде",
                text: "Инструктор держит связь с вами прямо во время катания и подсказывает каждое движение.",
              },
              {
                title: "Опытные инструкторы",
                text: "Учим с нуля сотни гостей — знаем, как быстро и безопасно поставить вас на фойл.",
              },
            ].map((item) => (
              <Card key={item.title}>
                <div className="mb-3">
                  <IconCheck className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted">{item.text}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* Блок скидки — только для агентской ссылки */}
      {isAgent && (
        <Section>
          <Container>
            <div className="mx-auto max-w-2xl rounded-3xl border border-accent/30 bg-accent/5 p-8 text-center sm:p-10">
              <Badge>Скидка по ссылке</Badge>
              <h2 className="mt-4 text-2xl font-bold sm:text-3xl">
                Базовое занятие дешевле на {formatVnd(agentDiscountFor("basic-adult"))}
              </h2>
              <div className="mt-6 flex flex-wrap items-baseline justify-center gap-3">
                <span className="text-xl text-muted line-through">
                  {formatVnd(basic.price)}
                </span>
                <span className="text-4xl font-bold text-accent-strong">
                  {formatVnd(discounted(basic.price, "basic-adult"))}
                </span>
              </div>
              {/* Парное занятие рядом: скидка на него другая, и раньше про неё
                  на лендинге не говорилось вовсе. */}
              <p className="mt-4 text-sm text-muted">
                Парное базовое обучение — дешевле на{" "}
                {formatVnd(agentDiscountFor("basic-duo"))}:{" "}
                <span className="line-through">{formatVnd(duo.price)}</span>{" "}
                <span className="font-semibold text-accent-strong">
                  {formatVnd(discounted(duo.price, "basic-duo"))}
                </span>
              </p>
              <p className="mt-3 text-sm text-muted">
                Скидка действует по этой ссылке на первое обучение. Записаться
                можно и на любую другую услугу — по обычной цене.
              </p>
              <div className="mt-8">
                <BookBtn refCode={code} serviceId={defaultServiceId} place="ref-bottom" size="lg">
                  Записаться
                </BookBtn>
              </div>
            </div>
          </Container>
        </Section>
      )}
    </>
  );
}
