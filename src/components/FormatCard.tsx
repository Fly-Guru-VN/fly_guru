import type { ComponentType, SVGProps } from "react";
import Image from "next/image";
import { BookBtn } from "@/components/BookBtn";
import { IconFlame } from "@/components/icons";
import { formatVnd, formatDuration } from "@/content/services";
import type { Service } from "@/content/services";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export type Format = {
  // Услуга из базы: отсюда берём название, цену и длительность.
  service: Service;
  // id той же услуги в базе — с ним открывается форма записи уже с выбранной
  // услугой. Может не найтись (услугу выключили в админке) — тогда форма
  // откроется с общим списком.
  serviceId?: string;
  desc: string;
  // Круглая иллюстрация формата.
  image: string;
  // Три коротких факта в подвале — как в макете.
  facts: { icon: Icon; label: string }[];
  // Самый ходовой формат: рамка вокруг карточки и плашка «Популярное».
  highlight?: boolean;
};

// Карточка формата обучения. Собрана по макету: круглая иллюстрация сверху,
// название, короткое описание, цена, кнопка и полоска из трёх фактов внизу.
//
// Плашка «Популярное» — не уголком, как в макете, а полосой во всю ширину
// карточки, приклеенной к её верху. У остальных карточек на этом месте пустая
// полоса той же высоты: иначе иллюстрация выделенной карточки съезжала бы вниз
// относительно соседних и ряд «плыл».
export function FormatCard({ format }: { format: Format }) {
  const { service, serviceId, desc, image, facts, highlight } = format;

  return (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-2xl bg-surface shadow-sm ${
        highlight ? "border-2 border-primary" : "border border-line"
      }`}
    >
      {highlight ? (
        <div className="flex items-center justify-center gap-1.5 bg-accent py-2 text-xs font-extrabold uppercase tracking-wide text-white">
          <IconFlame aria-hidden className="h-4 w-4" />
          Популярное
        </div>
      ) : (
        <div aria-hidden className="h-9" />
      )}

      <div className="flex flex-1 flex-col items-center px-5 pb-6 pt-4 text-center">
        <Image
          src={image}
          alt=""
          aria-hidden
          width={440}
          height={440}
          sizes="112px"
          className="h-28 w-28"
        />
        <h3 className="mt-3 text-lg font-bold leading-tight">{service.name}</h3>
        {/* flex-1 — чтобы цена, кнопка и подвал стояли на одной высоте во всех
            карточках, сколько бы строк ни занял текст. */}
        <p className="mt-2 flex-1 text-sm text-muted">{desc}</p>
        <div className="mt-4 flex items-baseline justify-center gap-2">
          <span className="text-2xl font-bold text-primary">{formatVnd(service.price)}</span>
          <span className="text-sm text-muted">/ {formatDuration(service)}</span>
        </div>
        <div className="mt-4 w-full">
          <BookBtn
            serviceId={serviceId}
            place="training-price"
            variant="secondary"
            className="w-full"
          >
            Записаться
          </BookBtn>
        </div>
      </div>

      {/* Высота полоски задана жёстко, как в карточках шагов на главной: у
          карточек разной длины подписи, и по содержимому полоски вставали бы на
          разной высоте. */}
      <div className="grid h-[4.5rem] grid-cols-3 border-t border-line bg-surface-2/50">
        {facts.map((f, i) => (
          <div
            key={f.label}
            className={`flex flex-col items-center justify-center gap-1.5 px-1 text-center ${
              i > 0 ? "border-l border-line" : ""
            }`}
          >
            <f.icon aria-hidden className="h-5 w-5 shrink-0 text-primary" />
            {/* На ПК кегль на пункт меньше: четыре карточки в ряд — плашка
                узкая, и подписи вроде «Индивидуальный подход» упирались в
                разделители. На телефоне карточка широкая, там 12 px.
                hyphens-auto — страховка на самые длинные слова: «Индивидуальный»
                целиком в плашку не влезает ни при каком разумном кегле, и без
                переноса оно вылезало на соседнюю колонку. */}
            <span
              lang="ru"
              className="hyphens-auto text-xs font-semibold leading-tight text-ink/85 md:text-[11px]"
            >
              {f.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
