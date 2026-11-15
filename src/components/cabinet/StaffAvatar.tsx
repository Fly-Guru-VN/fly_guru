import Image from "next/image";

// Аватарка сотрудника в «Выплате зарплаты» (15.11.2026). Фото — из
// users.photo_url (публичный бакет avatars: ставит сам человек в своих
// настройках или начальник в профиле). Нет фото — кружок с инициалами, цвет
// по имени: у каждого свой и не меняется от раза к разу.

const TONES = [
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-teal-100 text-teal-800",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase());
  return letters.join("") || "?";
}

function toneOf(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

const SIZE = {
  md: { px: 48, box: "h-12 w-12 text-base" },
  lg: { px: 96, box: "h-20 w-20 text-2xl sm:h-24 sm:w-24 sm:text-3xl" },
} as const;

export function StaffAvatar({
  name,
  photoUrl,
  size = "md",
  dim = false,
}: {
  name: string;
  photoUrl: string | null | undefined;
  size?: keyof typeof SIZE;
  dim?: boolean; // уволенный: приглушаем
}) {
  const s = SIZE[size];
  const base = `${s.box} shrink-0 rounded-full ${dim ? "opacity-60 grayscale" : ""}`;
  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt={name}
        width={s.px}
        height={s.px}
        className={`${base} object-cover`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`${base} flex items-center justify-center font-bold ${toneOf(name)}`}
    >
      {initials(name)}
    </div>
  );
}
