import {
  DEFAULT_LOCALE,
  isAppLocale,
  LOCALE_NAMES,
  LOCALE_NAMES_RU,
} from "@/i18n/locales";

// Плашка «на каком языке говорит гость» (0060).
//
// Зачем: с сентября 2026 сайт работает на семи языках, и заявку может оставить
// кореец или немец. Без этой отметки и админ, и инструктор узнают об этом уже
// в трубке — разговор начинается с неловкой паузы, а на пляже гость просто не
// понимает, что ему говорят.
//
// Русский язык НЕ показываем: у большинства заявок он и так русский, и плашка
// на каждой карточке превратилась бы в фон, который перестают замечать. Пустое
// значение (заявки до миграции, заявки из кабинета агента) — тоже молчим:
// догадка хуже честного пробела.
//
// Подпись двойная: по-русски — чтобы сотрудник понял с одного взгляда, и на
// самом языке — чтобы было видно, что именно читал гость.
export function ClientLocale({
  locale,
  className = "",
}: {
  locale: string | null | undefined;
  className?: string;
}) {
  if (!isAppLocale(locale) || locale === DEFAULT_LOCALE) return null;

  return (
    <p
      className={`inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary-strong ${className}`}
    >
      <span aria-hidden>🌐</span>
      {LOCALE_NAMES_RU[locale]} ({LOCALE_NAMES[locale]})
    </p>
  );
}
