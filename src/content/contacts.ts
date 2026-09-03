// Единый источник контактов и соцсетей. Используется в футере (все страницы)
// и на /contacts — чтобы номер правился в одном месте.

// Телефон в международном формате без пробелов — для tel:/wa.me/t.me ссылок.
const PHONE_RAW = "+84354964431";

export const contacts = {
  phone: {
    raw: PHONE_RAW,
    display: "+84 35 496 4431",
    tel: `tel:${PHONE_RAW}`,
    // wa.me требует номер без «+» и без разделителей
    whatsapp: `https://wa.me/${PHONE_RAW.replace("+", "")}`,
  },
  // У Telegram нет юзернейма — вход по номеру.
  telegram: `https://t.me/${PHONE_RAW}`,
  zalo: `https://zalo.me/${PHONE_RAW.replace("+", "")}`,
  email: "flyguruvn@gmail.com",
  address: "Maryna Beach Club, Нячанг, Вьетнам",
  // Метка ШКОЛЫ, а не пляжного клуба, на территории которого она стоит: раньше
  // тут была карточка Maryna Beach Club, и человек с сайта попадал на чужой
  // профиль — с чужими отзывами и без наших фото. Адрес рядом оставлен прежним:
  // физически школа действительно на территории клуба.
  mapLink: "https://maps.app.goo.gl/1rgSHUMUsvq3VUnT7",
  // Та же карточка школы, но сразу с РАЗВЁРНУТОЙ вкладкой отзывов — для
  // страницы /reviews, где человек и так пришёл читать чужой опыт.
  //
  // Короткая ссылка выше такого не умеет: она открывает карточку целиком, и
  // отзывы приходится искать самому. Адрес ниже собран руками из id карточки
  // (0x31706942a733ab3f:0xa675909174d42e6d — он лежит в параметре ftid, если
  // раскрутить короткую ссылку редиректами), хвост !9m1!1b1 и означает
  // «открыть отзывы».
  //
  // Формат недокументированный: если Google его когда-нибудь сломает, человек
  // всё равно попадёт на карточку школы — то есть туда же, куда вёл mapLink.
  // Проверено 28.08.2026.
  mapReviewsLink:
    "https://www.google.com/maps/place//data=!4m3!3m2!1s0x31706942a733ab3f:0xa675909174d42e6d!9m1!1b1",
  // Встраиваемая карта: iframe не принимает короткие ссылки maps.app.goo.gl,
  // поэтому ищем точку по названию карточки в Google Maps.
  //
  // t=h — вид «гибрид»: спутниковый снимок и поверх него названия улиц и мест.
  // Бухту с базой на снимке видно сразу, а по схеме это был безымянный кусок
  // берега. z=17 — крупный план базы, а не всего Нячанга.
  // Параметр t у встраиваемой карты недокументированный (как и сам output=embed):
  // если Google его сломает, карта просто вернётся к схеме — блок не развалится.
  // Проверено 03.09.2026.
  mapEmbed:
    "https://www.google.com/maps?q=FlyGuru+Efoil+Nha+Trang&t=h&z=17&output=embed",
  hours: "Ежедневно 8:30 – 18:00",
} as const;

// app — какой логотип рисовать (см. components/AppIcon.tsx). Лежит здесь, а не
// на странице: тот же список рисует и подвал на каждой странице сайта.
export const socials = [
  { name: "Instagram", app: "instagram", href: "https://www.instagram.com/flyguru.club/" },
  { name: "YouTube", app: "youtube", href: "https://www.youtube.com/@fly_guru" },
  { name: "TikTok", app: "tiktok", href: "https://www.tiktok.com/@denisflyguru" },
  { name: "Facebook", app: "facebook", href: "https://www.facebook.com/profile.php?id=61585234337399" },
  { name: "Telegram-канал", app: "telegram", href: "https://t.me/flyguru_club" },
] as const;
