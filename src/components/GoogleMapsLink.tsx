// Ссылка «Отзыв в Google Maps» и фирменная капля рядом с ней.
//
// Лежит отдельным файлом, а не в общем icons.tsx: это единственное место, где
// нужен чужой бренд, и цвета у капли свои, а не currentColor. Ссылку рисуют обе
// карточки отзыва (с фото и без), поэтому разметка общая — иначе подпись
// разъезжается между главной и /reviews.

export function GoogleMapsLink({ href, className = "" }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink ${className}`}
    >
      Отзыв в <span className="text-[#4285f4]">Google Maps</span>
      <IconGoogleMapsPin className="h-4 w-4" />
    </a>
  );
}

// Метка Google Maps: капля в четырёх фирменных цветах.
export function IconGoogleMapsPin({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <clipPath id="gmaps-pin">
          <path d="M12 2.2c-3.9 0-7 3.1-7 7 0 5.2 7 12.6 7 12.6s7-7.4 7-12.6c0-3.9-3.1-7-7-7z" />
        </clipPath>
      </defs>
      <g clipPath="url(#gmaps-pin)">
        <rect x="0" y="0" width="24" height="24" fill="#ea4335" />
        <path d="M0 24 24 0v7L7 24z" fill="#fbbc04" />
        <path d="M0 24 24 6v7L11 24z" fill="#34a853" />
        <path d="M0 0h13L0 13z" fill="#4285f4" />
      </g>
      <circle cx="12" cy="9.2" r="2.5" fill="#fff" />
    </svg>
  );
}
