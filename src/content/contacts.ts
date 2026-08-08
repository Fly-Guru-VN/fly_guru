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
  // Встраиваемая карта: iframe не принимает короткие ссылки maps.app.goo.gl,
  // поэтому ищем точку по названию карточки в Google Maps.
  mapEmbed: "https://www.google.com/maps?q=FlyGuru+Efoil+Nha+Trang&output=embed",
  hours: "Ежедневно 8:30 – 18:00",
} as const;

export const socials = [
  { name: "Instagram", href: "https://www.instagram.com/flyguru.club/" },
  { name: "YouTube", href: "https://www.youtube.com/@fly_guru" },
  { name: "TikTok", href: "https://www.tiktok.com/@denisflyguru" },
  { name: "Facebook", href: "https://www.facebook.com/profile.php?id=61585234337399" },
  { name: "Telegram-канал", href: "https://t.me/flyguru_club" },
] as const;
