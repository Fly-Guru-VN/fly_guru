import Image from "next/image";

// Логотипы приложений (WhatsApp, Telegram, Instagram…) — картинками, а не
// путями SVG.
//
// Наши собственные иконки обводятся в путь и красятся currentColor
// (см. scripts/trace-icon.mjs), но здесь так нельзя: это чужие фирменные знаки,
// их узнают именно по цвету, и перекрашивать их нечестно и бессмысленно.
//
// Файлы — квадраты 128×128 с прозрачным фоном, собраны из исходников
// photo_video/иконки приложения: поля обрезаны, знак вписан в 120 px и
// отцентрован. Поэтому в ряду все логотипы выглядят одного размера, хотя
// у YouTube знак широкий, а у Instagram квадратный.
const APPS = {
  whatsapp: "/media/apps/whatsapp.png",
  telegram: "/media/apps/telegram.png",
  zalo: "/media/apps/zalo.png",
  instagram: "/media/apps/instagram.png",
  facebook: "/media/apps/facebook.png",
  youtube: "/media/apps/youtube.png",
  tiktok: "/media/apps/tiktok.png",
} as const;

export type AppName = keyof typeof APPS;

// Размер задаётся классами (h-10 w-10 и т. п.), как у остальных иконок.
// width/height здесь — размер ФАЙЛА: он вчетверо больше экранного, чтобы на
// плотных экранах телефона логотип не мылил.
//
// alt пустой: рядом всегда стоит название приложения словами, и читалка экрана
// иначе прочитала бы его дважды.
export function AppIcon({ app, className = "" }: { app: AppName; className?: string }) {
  return (
    <Image src={APPS[app]} alt="" width={128} height={128} className={`shrink-0 ${className}`} />
  );
}
