import Image from "next/image";
import type { ShiftPhoto } from "@/lib/shifts";
import { photoLabel, PHOTO_KIND_LABEL, PHOTO_PHASE_LABEL } from "@/lib/shiftRules";

// Снимки смены в карточке дня. Раньше кадры шли просто плиткой, а что на них —
// было написано только в подсказке при наведении (на телефоне её нет вообще).
// Теперь под каждым фото стоит подпись: фаза + конкретная единица инвентаря
// («Открытие · Доска №3»), чтобы босс с телефона понимал, к чему кадр.

export function ShiftPhotos({ photos }: { photos: ShiftPhoto[] }) {
  if (photos.length === 0) return null;

  // Сначала утренние кадры, потом вечерние — как проходит сам день.
  const ordered = [...photos].sort((a, b) =>
    a.phase === b.phase ? 0 : a.phase === "open" ? -1 : 1,
  );

  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {ordered.map((p) => {
        const phase = PHOTO_PHASE_LABEL[p.phase];
        const what = p.equipmentName ?? photoLabel(p.kind, p.phase);
        return (
          <a
            key={p.id}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block"
          >
            <Image
              src={p.url}
              alt={`${phase}: ${what}`}
              width={200}
              height={200}
              unoptimized
              className="aspect-square w-full rounded-lg border border-line object-cover transition-opacity group-hover:opacity-90"
            />
            <p className="mt-1 text-[11px] font-semibold leading-tight">
              {what}
            </p>
            <p className="text-[11px] leading-tight text-muted">
              {phase}
              {/* Для доски/крыла название инвентаря уже стоит выше, поэтому
                  здесь дублируем тип только когда он что-то добавляет. */}
              {p.equipmentName && ` · ${PHOTO_KIND_LABEL[p.kind]}`}
            </p>
          </a>
        );
      })}
    </div>
  );
}
