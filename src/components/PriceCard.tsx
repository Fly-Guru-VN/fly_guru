import Image from "next/image";
import { BookBtn } from "@/components/BookBtn";
import { Badge } from "@/components/ui";
import { IconClock, IconFlame } from "@/components/icons";
import { formatDuration, type Service } from "@/content/services";
import { AgentPrice, AgentDiscountNote } from "@/components/AgentPrice";

// Карточка услуги в прайсе: круглая иллюстрация, название, одна фраза о сути,
// длительность, цена и кнопка записи.
//
// Чем отличается от <FormatCard> на странице обучения, раз выглядят они почти
// одинаково. Там карточка — вся страница про один формат: у неё в подвале три
// факта («снаряжение включено», «инструктор на связи»), которые продают именно
// этот формат. Здесь карточек тринадцать на шесть вкладок, и одни и те же три
// факта повторились бы тринадцать раз — поэтому они вынесены под вкладки одной
// общей полосой, а длительность встала чипом под описанием, как в макете.
//
// Плашка «Популярное» лежит В УГЛУ карточки, а не поясом над ней: у ряда из
// четырёх карточек пояс поднимал бы весь ряд на свою высоту ради одной метки.
// Абсолютное позиционирование высоту карточки не меняет, поэтому все карточки
// вкладки остаются одного роста.
export function PriceCard({
  service,
  serviceId,
  highlight,
}: {
  service: Service;
  // id услуги в базе — с ним форма записи откроется уже с выбранной услугой.
  // Может не найтись (услугу выключили в админке) — тогда откроется общий список.
  serviceId?: string;
  highlight?: boolean;
}) {
  const duration = formatDuration(service);

  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl bg-surface p-5 text-center shadow-[0_16px_36px_-28px_rgba(15,34,51,0.55)] ${
        highlight ? "border-2 border-primary" : "border border-line"
      }`}
    >
      {highlight && (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-accent-strong">
          <IconFlame aria-hidden className="h-3.5 w-3.5" />
          Популярное
        </span>
      )}

      {/* Иллюстрация декоративная: что это за услуга, говорит заголовок под
          ней, и alt повторял бы его слово в слово. */}
      <Image
        src={service.image ?? "/placeholders/media.svg"}
        alt=""
        aria-hidden
        width={440}
        height={440}
        sizes="124px"
        className="mx-auto h-[7.7rem] w-[7.7rem]"
      />

      <h3 className="mt-3 text-lg font-bold leading-tight">{service.name}</h3>

      {service.membersOnly && (
        <Badge className="mx-auto mt-2">По одобрению инструктора</Badge>
      )}

      {/* flex-1 у описания: сколько бы строк оно ни заняло, цена и кнопка во
          всех карточках ряда встают на одной высоте. */}
      {service.blurb && <p className="mt-2 flex-1 text-sm text-muted">{service.blurb}</p>}

      {/* Длительности нет у фото/видео — тогда чипа просто не будет: «—» под
          названием читается как брак вёрстки. */}
      {duration !== "—" && (
        <p className="mt-3 inline-flex items-center justify-center gap-1.5 self-center rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
          <IconClock aria-hidden className="h-4 w-4 shrink-0" />
          {duration}
        </p>
      )}

      {/* Цена клиентская: гостю, пришедшему по агентской ссылке, она
          показывает «было → стало» (см. AgentPrice), остальным — как обычно. */}
      <div className="mt-3 flex flex-wrap items-baseline justify-center gap-2">
        <AgentPrice
          price={service.price}
          code={service.id}
          className="text-2xl font-bold text-primary"
        />
      </div>
      <AgentDiscountNote
        code={service.id}
        price={service.price}
        className="mt-1 text-xs font-semibold text-accent-strong"
      />

      {service.note && <p className="mt-1 text-xs text-muted">{service.note}</p>}

      <div className="mt-4">
        <BookBtn
          serviceId={serviceId}
          place="prices"
          variant="secondary"
          className="w-full"
        >
          Записаться
        </BookBtn>
      </div>
    </div>
  );
}
