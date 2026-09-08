export interface Review {
  // Устойчивый ключ отзыва: по нему берётся текст из messages (раздел
  // ReviewTexts) и по нему же отзыв находят страницы.
  id: string;
  name: string;
  // Давность отзыва в месяцах (города Google-отзывы не отдают). Число, а не
  // строка: «6 месяцев назад» на семи языках склоняется по-разному, и фразу
  // собирает Intl.RelativeTimeFormat — см. formatMonthsAgo.
  monthsAgo: number;
  rating: number; // 1..5
  sourceUrl?: string; // ссылка на отзыв в Google Maps
  // Фото с занятия и аватарка из профиля Google. Есть только у тройки с
  // главной — на /reviews карточки без фото, там их два десятка.
  photo?: string;
  avatar?: string;
  // Текст отзыва на языке страницы. Подставляет localizeReviews: в самом
  // справочнике текстов нет.
  text?: string;
}

// Реальные отзывы с Google Maps (профиль FlyGuru, Нячанг).
// Тексты приведены как есть, вычищены только обрывки интерфейса; переводы
// живут в messages/<язык>.json. На главной — тройка из homeReviewIds.
export const reviews: Review[] = [
  {
    id: "polina-ch",
    name: "Полина Черненькая",
    photo: "/media/photo/reviews/polina-ch.webp",
    avatar: "/media/photo/reviews/av-polina-ch.webp",
    monthsAgo: 6,
    rating: 5,
    sourceUrl: "https://maps.app.goo.gl/vZA1Hnf7RBpcBoyp6",
  },
  {
    id: "artem-s",
    name: "Artem S.",
    monthsAgo: 3,
    rating: 5,
    sourceUrl: "https://maps.app.goo.gl/XHv4qTEpxzQvJAdp8",
  },
  {
    id: "evgeny-k",
    name: "Евгений Курьянов",
    monthsAgo: 5,
    rating: 5,
    sourceUrl: "https://maps.app.goo.gl/Shtymxmz6m15x2vd9",
  },
  {
    id: "anna-l",
    name: "Anna Larina",
    monthsAgo: 4,
    rating: 5,
    sourceUrl: "https://maps.app.goo.gl/7oAkBiS5v9dfVbFLA",
  },
  {
    id: "polina-sch",
    name: "Polina Shchegoleva",
    photo: "/media/photo/reviews/polina-sch.webp",
    avatar: "/media/photo/reviews/av-polina-sch.webp",
    monthsAgo: 10,
    rating: 5,
    sourceUrl: "https://maps.app.goo.gl/s28NVcDH3bw8fGAg9",
  },
  {
    id: "ilya-ya",
    name: "Илья Яковлев",
    monthsAgo: 6,
    rating: 5,
    sourceUrl: "https://maps.app.goo.gl/53HoAkPjYbfxx7r29",
  },
  {
    id: "yulia",
    name: "Юлия",
    photo: "/media/photo/reviews/yulia.webp",
    avatar: "/media/photo/reviews/av-yulia.webp",
    monthsAgo: 10,
    rating: 5,
    sourceUrl: "https://maps.app.goo.gl/8Z2CDuBaqBE5MrFX6",
  },
  {
    id: "eduard-r",
    name: "Эдуард Рябинов",
    monthsAgo: 6,
    rating: 5,
    sourceUrl: "https://maps.app.goo.gl/G9K6XcPZo9ThgijB6",
  },
  {
    id: "xonder",
    name: "Xonder",
    monthsAgo: 7,
    rating: 5,
    sourceUrl: "https://maps.app.goo.gl/NaRzgvxXfecAfvmP7",
  },
  {
    id: "khuong-anh",
    name: "Khuong Anh",
    monthsAgo: 5,
    rating: 5,
    sourceUrl: "https://maps.app.goo.gl/FA6SsXve4gfgd2C99",
  },
];

// Тройка для главной — те отзывы, к которым есть фото с занятия. Порядок задан
// руками, а не срезом массива: на главной карточки стоят слева направо именно
// так, как их отобрали под фотографии.
export const homeReviewIds = ["polina-sch", "yulia", "polina-ch"] as const;

// Отзыв по ключу. Бросаем, а не возвращаем undefined: отзыв пропал из
// справочника — это опечатка в коде, и увидеть её надо на сборке.
export function pickReview(list: Review[], id: string): Review {
  const r = list.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown review id: ${id}`);
  return r;
}

// «6 месяцев назад» на языке страницы. Своей таблицы склонений не держим:
// Intl знает и «6 месяцев», и «vor 6 Monaten», и «6개월 전».
export function formatMonthsAgo(locale: string, monthsAgo: number): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(
    -monthsAgo,
    "month",
  );
}

// Тексты отзывов на языке страницы: справочник выше хранит только структуру.
// Порядок и состав списка не меняются — заполняется одно поле text.
export function localizeReviews(
  list: Review[],
  t: (key: string) => string,
): Review[] {
  return list.map((r) => ({ ...r, text: t(`${r.id}.text`) }));
}
