import type { Metadata } from "next";
import { Container, Section, SectionHeading, Badge } from "@/components/ui";
import {
  CATEGORY_LABELS,
  formatVnd,
  formatDuration,
  type ServiceCategory,
} from "@/content/services";
import { getSiteServices } from "@/lib/services";
import { JsonLd } from "@/components/JsonLd";
import { priceListSchema } from "@/lib/schema";

export const metadata: Metadata = { title: "Прайс" };
export const dynamic = "force-static"; // статичная страница, форсим SSG

// Порядок групп в прайсе.
const ORDER: ServiceCategory[] = ["training", "tandem", "rental", "subscription", "tour", "extra"];

export default async function PricesPage() {
  // Цены из базы (правятся в админке); тексты и примечания — из контента.
  const services = await getSiteServices();
  return (
    <Section className="pt-10 sm:pt-14">
      {/* Прайс для поисковиков: те же услуги и те же цены, что в таблице ниже —
          и то и другое берётся из базы, разъехаться не может. */}
      <JsonLd data={priceListSchema(services)} />
      <Container>
        <SectionHeading eyebrow="Прайс" title="Стоимость услуг" subtitle="Все цены в донгах (₫). Оплата на месте." />

        <div className="mt-10 space-y-10">
          {ORDER.map((cat) => {
            const items = services.filter((s) => s.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary">
                  {CATEGORY_LABELS[cat]}
                </h2>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                  {items.map((s, i) => (
                    <div
                      key={s.id}
                      className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 sm:px-5 ${
                        i > 0 ? "border-t border-line" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium">
                          {s.name}
                          {s.membersOnly && (
                            <Badge className="ml-2 align-middle">По одобрению инструктора</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted">
                          {formatDuration(s)}
                          {s.note && ` · ${s.note}`}
                        </div>
                      </div>
                      <div className="whitespace-nowrap font-bold text-primary">
                        {formatVnd(s.price)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 space-y-1 text-sm text-muted">
          <p>Экскурсия и сафари — только для членов клуба, требуется базовое обучение.</p>
          <p>Абонемент выгоднее проката: окупается уже с 5-й каталки.</p>
          <p>Минуты абонемента действуют 3 месяца, остаток можно передать другу.</p>
        </div>
      </Container>
    </Section>
  );
}
