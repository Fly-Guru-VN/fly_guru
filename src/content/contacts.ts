// Единый источник контактов и соцсетей. Используется в футере (все страницы)
// и на /contacts — чтобы номер правился в одном месте.
//
// Адрес и часы работы лежат НЕ здесь, а в messages (раздел Contacts): «Нячанг»
// и «Ежедневно 8:30 – 18:00» — это текст на языке гостя. Здесь остаётся то,
// что от языка не зависит: номер, ссылки, координаты карточки.

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
  // Метка ШКОЛЫ, а не пляжного клуба, на территории которого она стоит: раньше
  // тут была карточка Maryna Beach Club, и человек с сайта попадал на чужой
  // профиль — с чужими отзывами и без наших фото. Адрес рядом оставлен прежним:
  // физически школа действительно на территории клуба.
  mapLink: "https://maps.app.goo.gl/1rgSHUMUsvq3VUnT7",
  // Сразу список отзывов школы — для страницы /reviews, где человек и так
  // пришёл читать чужой опыт.
  //
  // Короткая ссылка выше такого не умеет: она открывает карточку в Картах, а
  // у карточки без входа в Google вкладки «Отзывы» нет вовсе (только «Обзор»
  // и «Информация»). Поэтому здесь стандартная ссылка Google на отзывы места
  // по его Place ID: на телефоне открывает экран «Отзывы» с сортировкой, на
  // ПК — поиск Google с карточкой школы и отзывами.
  //
  // Place ID ChIJP6szp0JpcDERbS7UdJGQdaY — та же карточка, что у mapLink
  // (id 0x31706942a733ab3f:0xa675909174d42e6d). До 29.09.2026 тут стоял
  // самодельный адрес Карт с хвостом !9m1!1b1 — Google перестал его понимать,
  // и кнопки вели на пустую карту без школы.
  // Проверено 29.09.2026.
  mapReviewsLink:
    "https://search.google.com/local/reviews?placeid=ChIJP6szp0JpcDERbS7UdJGQdaY",
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
} as const;

// app — какой логотип рисовать (см. components/AppIcon.tsx). Лежит здесь, а не
// на странице: тот же список рисует и подвал на каждой странице сайта.
// id — устойчивый ключ ссылки. По нему её находит код (клубный канал на
// /club) и по нему же берётся подпись из messages, если название сети не
// самодостаточно: «Telegram-канал» — русские слова, а Instagram и YouTube
// одинаковы на всех языках. name остаётся как есть: он уходит в аналитику
// (channel), и его переименование разорвало бы историю отчётов.
export const socials = [
  { id: "instagram", name: "Instagram", app: "instagram", href: "https://www.instagram.com/flyguru.club/" },
  { id: "youtube", name: "YouTube", app: "youtube", href: "https://www.youtube.com/@fly_guru" },
  { id: "tiktok", name: "TikTok", app: "tiktok", href: "https://www.tiktok.com/@denisflyguru" },
  { id: "facebook", name: "Facebook", app: "facebook", href: "https://www.facebook.com/profile.php?id=61585234337399" },
  { id: "telegram-channel", name: "Telegram-канал", app: "telegram", href: "https://t.me/flyguru_club" },
] as const;
