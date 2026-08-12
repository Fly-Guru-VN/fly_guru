import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import HomePage from "../../page";
import { LinkMark } from "@/components/LinkMark";
import { LINK_TAG_RE } from "@/lib/channels";

// Короткая рекламная ссылка: flyguru.vn/i/instagram.
//
// Зачем: раньше в шапку профиля и в описание ролика вставляли
// «flyguru.vn/?src=instagram» — метка торчала у гостя в адресной строке и
// выглядела технической. Теперь ссылка короткая, а сама метка исчезает из
// адреса сразу после загрузки (см. LinkMark).
//
// Гость при этом попадает ровно на главную: страница здесь не своя, а тот же
// компонент HomePage — второй копии главной, которая начнёт отставать от
// первой, быть не должно.
//
// Метку СЮДА можно подставить любую, не только заведённую в «Материалах»:
// придуманную на ходу видно во вкладке «Источники» отдельной строкой с
// пометкой, что такой метки в материалах нет. Формат при этом проверяем — в
// адрес можно вписать что угодно, а метка уходит в базу.

// Из поиска сюда ходить незачем: страница показывает ту же главную, и в
// индексе это её двойник (в robots.txt /i/ тоже закрыт).
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function TaggedHomePage({
  params,
}: {
  params: Promise<{ locale: string; src: string }>;
}) {
  const { locale, src } = await params;
  setRequestLocale(locale);

  if (!LINK_TAG_RE.test(src)) notFound();

  return (
    <>
      <LinkMark src={src} cleanTo="/" />
      <HomePage />
    </>
  );
}
