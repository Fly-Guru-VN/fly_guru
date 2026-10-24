import type { Metadata } from "next";
import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAgentProfile } from "@/lib/agentCabinet";
import { getActiveServices } from "@/lib/services";
import { agentDiscountFor } from "@/lib/agentTerms";
import { SITE_URL } from "@/lib/site";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";
import { CopyLink } from "../../admin/CopyLink";
import { NoAgentProfile } from "../NoAgentProfile";
import { CopyText } from "./CopyText";

export const metadata: Metadata = { title: "Агент · Материалы" };

// Материалы агента: что отправить гостю.
//
// Три готовых сообщения и полезные страницы сайта. Заготовки не выдуманы «для
// красоты»: агенты и так пишут гостям, только каждый по-своему — школа не знает,
// что о ней рассказывают, и половина сообщений уходит без ссылки, то есть без
// скидки гостю и без награды агенту. Здесь текст уже со ССЫЛКОЙ САМОГО АГЕНТА и
// с его условиями — суммы подставляются из его тарифа, а не пишутся руками.
//
// Все ссылки абсолютные (SITE_URL): текст уезжает в WhatsApp и Zalo, где
// относительный путь — просто набор символов.
//
// Факты в текстах — только те, что уже написаны на сайте (обучение, FAQ,
// клуб): 90% едут на первом занятии, жилет/шлем/рация, закрытая бухта. До
// 24.10.2026 здесь по ошибке были тексты про кайтсёрфинг («ветер», «кайт»,
// «гидрокостюм») — агент разослал бы гостям неправду про школу.

const vnd = (n: number) => `${n.toLocaleString("ru-RU")} ₫`;

// Страницы, которые чаще всего просят показать «а что это вообще такое».
const PAGES: { label: string; path: string; hint: string }[] = [
  { label: "Обучение", path: "/training", hint: "как проходит первое занятие" },
  { label: "Тандем", path: "/tandem", hint: "полёт с инструктором, без обучения" },
  { label: "Цены", path: "/prices", hint: "все услуги и цены" },
  { label: "Отзывы", path: "/reviews", hint: "живые отзывы и оценка Google" },
];

export default async function AgentMaterialsPage() {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const supabase = await createClient();
  const profile = await getAgentProfile(supabase, user.id);
  if (!profile) return <NoAgentProfile />;

  // Скидки берём из его тарифа и с настоящих цен: у процентного тарифа сумма
  // зависит от цены услуги, и вписать её в текст раз и навсегда нельзя.
  const services = await getActiveServices();
  const priceOf = (code: string) =>
    services.find((s) => s.code === code)?.price ?? null;
  const basicPrice = priceOf("basic-adult");
  const duoPrice = priceOf("basic-duo");
  const basicDiscount = agentDiscountFor("basic-adult", basicPrice, profile.plan);
  const duoDiscount = agentDiscountFor("basic-duo", duoPrice, profile.plan);
  // Абонемент — только у тарифов, где он в условиях («Вариант 1», 0072).
  const subPrice = priceOf("subscription");
  const subDiscount = agentDiscountFor("subscription", subPrice, profile.plan);

  const link = `${SITE_URL}/r/${profile.refCode}`;

  const shortText = `Привет! Полёт на электрофойле в Нячанге, школа FlyGuru.
Опыт не нужен: 90% учеников едут уже на первом занятии. Всё снаряжение выдают, с собой только купальник.
Записаться со скидкой по моей ссылке: ${link}`;

  const priceText = [
    "Обучение на электрофойле в Нячанге, школа FlyGuru.",
    basicPrice !== null &&
      (basicDiscount > 0
        ? `Базовое обучение: ${vnd(basicPrice)}, по моей ссылке ${vnd(basicPrice - basicDiscount)}.`
        : `Базовое обучение: ${vnd(basicPrice)}.`),
    duoPrice !== null &&
      (duoDiscount > 0
        ? `Парное (вдвоём): ${vnd(duoPrice)}, по моей ссылке ${vnd(duoPrice - duoDiscount)}.`
        : `Парное (вдвоём): ${vnd(duoPrice)}.`),
    subPrice !== null &&
      subDiscount > 0 &&
      `Абонемент 300 минут на 3 месяца: ${vnd(subPrice)}, по моей ссылке ${vnd(subPrice - subDiscount)}.`,
    "Снаряжение включено: электрофойл, жилет, шлем, рация.",
    `Записаться: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");

  const doubtText = `Опыт не нужен: 90% учеников едут уже на первом занятии, серфинг или вейк не требуются.
Это безопасно: занятие в спасательном жилете и шлеме, инструктор всё время на связи по рации, скорости на обучении небольшие, падать в воду не больно.
С собой только купальные принадлежности, остальное выдаём.
Катаемся в закрытой бухте у Maryna Beach Club.
Как проходит занятие: ${SITE_URL}/training
Записаться со скидкой: ${link}`;

  return (
    <div>
      <PageHeader title="Материалы" hint="Что отправить гостю" />
      <PageNote>
        Тексты уже с вашей ссылкой и вашими условиями — скопируйте и отправьте
        как есть. Гость, перешедший по ссылке, закрепляется за вами на 30 дней,
        даже если запишется не сразу.
      </PageNote>

      <section className="mt-4 rounded-2xl border border-primary/30 bg-surface p-4">
        <h2 className="font-bold">Моя ссылка</h2>
        <div className="mt-2">
          <CopyLink path={`/r/${profile.refCode}`} />
        </div>
        <p className="mt-2 text-sm text-muted">
          QR этой же ссылки — во вкладке «Моя ссылка».
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-bold">Готовые сообщения</h2>
        <div className="mt-3 space-y-3">
          <CopyText title="Коротко — первое сообщение" text={shortText} />
          <CopyText title="С ценами и скидкой" text={priceText} />
          <CopyText title="Если гость сомневается" text={doubtText} />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-bold">Страницы сайта</h2>
        <p className="mt-0.5 text-sm text-muted">
          Показать гостю, что это такое. Скидку даёт только ваша ссылка выше —
          записывать гостя лучше через неё.
        </p>
        <div className="mt-3 space-y-3 rounded-2xl border border-line bg-surface p-4">
          {PAGES.map((p) => (
            <div key={p.path}>
              <p className="text-sm font-semibold">
                {p.label}
                <span className="font-normal text-muted"> · {p.hint}</span>
              </p>
              <div className="mt-1">
                <CopyLink path={p.path} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Что говорить про школу</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-muted">
          <li>Учат с нуля, опыт не нужен: 90% учеников едут уже на первом занятии.</li>
          <li>Снаряжение включено: электрофойл, жилет, шлем, рация, спец-одежда.</li>
          <li>Инструктор всё занятие на связи с гостем по рации.</li>
          <li>Катаемся в закрытой бухте у Maryna Beach Club в Нячанге.</li>
          <li>Взрослая программа с 15 лет, детская с 8 до 14; вес от 40 до 130 кг.</li>
        </ul>
        <p className="mt-3 text-sm text-muted">
          Чего обещать не надо: что поедет каждый (едут 90%, а не все), скидки
          сверх ваших условий и что-то, чего нет на сайте.
        </p>
      </section>
    </div>
  );
}
