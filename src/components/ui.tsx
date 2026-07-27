import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

// Центрирующий контейнер с одинаковыми полями на всех страницах.
export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

// Вертикальный ритм секций. tone="muted" — чуть другой фон для чередования.
export function Section({
  children,
  className = "",
  tone = "default",
  id,
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "muted" | "primary";
  id?: string;
}) {
  const tones = {
    default: "",
    muted: "bg-surface-2",
    primary: "bg-primary text-white",
  };
  return (
    <section id={id} className={`py-14 sm:py-20 ${tones[tone]} ${className}`}>
      {children}
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      {eyebrow && (
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
      )}
      <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-3 text-muted">{subtitle}</p>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-strong ${className}`}
    >
      {children}
    </span>
  );
}

// «light» — для кнопок поверх фото и видео: обычная secondary там пропадает,
// её бирюзовая рамка на тёмном кадре почти не видна.
export type ButtonVariant = "primary" | "secondary" | "ghost" | "light";

type ButtonProps = {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "md" | "lg";
  className?: string;
};

// Классы кнопки одним местом — их переиспользует и <Button> (ссылка), и
// <BookBtn> (открывает модалку записи), чтобы обе выглядели одинаково.
export function buttonClasses({
  variant = "primary",
  size = "md",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: "md" | "lg";
  className?: string;
} = {}): string {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors";
  const sizes = { md: "px-5 py-3 text-sm", lg: "px-7 py-4 text-base" };
  const variants = {
    primary: "bg-accent text-white hover:bg-accent-strong",
    secondary: "border border-primary text-primary hover:bg-primary hover:text-white",
    ghost: "text-primary hover:text-primary-strong",
    light:
      "border border-white/70 bg-white/10 text-white backdrop-blur-sm hover:bg-white hover:text-primary-strong",
  };
  return `${base} ${sizes[size]} ${variants[variant]} ${className}`;
}

// Кнопка-ссылка. Использует локале-осведомлённый Link (сам ставит /en, /vi).
export function Button({ href, children, variant = "primary", size = "md", className = "" }: ButtonProps) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, className })}>
      {children}
    </Link>
  );
}
