import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Оборачиваем конфиг плагином next-intl: он подключает src/i18n/request.ts
// и включает поддержку сообщений/локалей на уровне сборки.
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Служебный адрес продакшн-деплоя (fly-guru.vercel.app) отдаёт тот же сайт,
  // что и основной домен, и не закрыт от индексации — для поисковика это сайт
  // ДВОЙНИК, который отбирает у flyguru.pro позиции. Уводим его на основной
  // домен навсегда (308), сохраняя путь: /training → www.flyguru.pro/training.
  //
  // Хост перечислен ПОИМЁННО, не по маске *.vercel.app: у превью-деплоев
  // (ветки, пул-реквесты) адреса тоже на vercel.app, и по маске они бы
  // перестали открываться — а именно на них удобно проверять правки до
  // выкатки. Превью Vercel и так закрывает от поисковиков сам.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "fly-guru.vercel.app" }],
        destination: "https://www.flyguru.pro/:path*",
        permanent: true,
      },
    ];
  },
  experimental: {
    // Загрузка аватарки в настройках кабинета идёт через server action;
    // дефолтный лимит тела (1 МБ) для фото с телефона мал.
    serverActions: { bodySizeLimit: "5mb" },
  },
  images: {
    // Next 16 отдаёт только те значения quality, что перечислены здесь.
    // 90 — для фото на воде: на 75 небо и брызги заметно рассыпаются.
    qualities: [75, 90],
    // Разрешаем next/image отдавать SVG — используется для локальных
    // плейсхолдеров в /public/placeholders. Источник доверенный (наш репозиторий).
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Аватарки инструкторов и фото клиентов лежат в публичных бакетах
    // Supabase Storage. Перечисляем бакеты поимённо, а не /public/** целиком:
    // так новый бакет не начнёт раздаваться через наш домен по недосмотру.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/avatars/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/clients/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/shifts/**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
