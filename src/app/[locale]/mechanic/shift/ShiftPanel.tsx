"use client";

import Image from "next/image";
import { useActionState } from "react";
import {
  addShiftPhotoAction,
  deleteShiftPhotoAction,
  openShiftAction,
  closeShiftAction,
} from "../../instructor/actions";
import type { InstructorShift, PhotoKind, PhotoPhase, ShiftPhoto } from "@/lib/shifts";
import type { EquipmentItem } from "@/lib/equipment";
import { PHOTO_KIND_LABEL as KIND_LABEL } from "@/lib/shiftRules";
import { vnTimeLabel } from "@/lib/dates";

// Экран смены механика. Механика съёмки и экшены — те же, что у инструктора
// (одни и те же server actions, одна и та же таблица shifts).
//
// Отличие одно, но важное: регламент 9:00/18:00 к механику не применяется. Он
// открывает и закрывает смену когда нужно по работе, поэтому здесь нет ни
// «вовремя/поздно/залёт», ни красной подсветки — только время. Пояснение
// появляется, лишь если он сам написал комментарий.

// Один загрузчик снимка. key завязан на число уже сделанных кадров этого слота:
// после успешной загрузки счётчик растёт → форма перемонтируется → поля
// очищаются сами. Снимок засчитывается сразу при выборе файла (requestSubmit).
function PhotoUploader({
  phase,
  kind,
  slotLabel,
  equipment,
}: {
  phase: PhotoPhase;
  kind: PhotoKind;
  slotLabel: string;
  equipment?: EquipmentItem[];
}) {
  const [state, formAction, pending] = useActionState(addShiftPhotoAction, {
    error: null,
  });

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="phase" value={phase} />
      <input type="hidden" name="kind" value={kind} />
      {equipment && (
        <label className="text-xs text-muted">
          {KIND_LABEL[kind]}
          <select
            name="equipmentId"
            required
            defaultValue=""
            className="mt-1 block w-40 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="" disabled>
              — выбрать —
            </option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-xs text-muted">
        {equipment ? `Снимок · ${slotLabel}` : slotLabel}
        <input
          type="file"
          name="photo"
          accept="image/*"
          capture="environment"
          required
          disabled={pending}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="mt-1 block w-full text-xs text-muted file:mr-3 file:rounded-full file:border-0 file:bg-line/50 file:px-3 file:py-1.5 file:text-xs file:font-semibold disabled:opacity-60"
        />
      </label>
      {pending && (
        <span className="pb-2 text-xs font-semibold text-primary">Загрузка…</span>
      )}
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

function PhotoThumb({ photo, deletable }: { photo: ShiftPhoto; deletable: boolean }) {
  return (
    <div className="relative">
      <Image
        src={photo.url}
        alt={KIND_LABEL[photo.kind]}
        width={96}
        height={96}
        className="h-24 w-24 rounded-xl object-cover"
      />
      <span className="absolute inset-x-0 bottom-0 truncate rounded-b-xl bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {photo.equipmentName ?? KIND_LABEL[photo.kind]}
      </span>
      {deletable && (
        <form action={deleteShiftPhotoAction} className="absolute right-1 top-1">
          <input type="hidden" name="id" value={photo.id} />
          <button
            type="submit"
            aria-label="Убрать кадр"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-sm font-bold text-white transition-colors hover:bg-red-500"
          >
            ×
          </button>
        </form>
      )}
    </div>
  );
}

// Секция одной фазы (открытие или закрытие): загрузчики + миниатюры.
function PhaseSection({
  phase,
  photos,
  boards,
  wings,
  editable,
}: {
  phase: PhotoPhase;
  photos: ShiftPhoto[];
  boards: EquipmentItem[];
  wings: EquipmentItem[];
  editable: boolean;
}) {
  return (
    <div className="space-y-4">
      {editable && (
        <div className="space-y-3">
          <PhotoUploader
            key={`board-${photos.filter((p) => p.kind === "board").length}`}
            phase={phase}
            kind="board"
            slotLabel="доска"
            equipment={boards}
          />
          <PhotoUploader
            key={`wing-${photos.filter((p) => p.kind === "wing").length}`}
            phase={phase}
            kind="wing"
            slotLabel="крыло"
            equipment={wings}
          />
          {/* Необязательные снимки (связь, дефекты) — под раскрытием, чтобы не
              мозолили глаза: обычно нужны только доска и крыло. */}
          <details className="group rounded-xl border border-line/60 bg-bg/40 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted">
              Дополнительно
              <span className="text-muted transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="space-y-3 px-3 pb-3">
              <PhotoUploader
                key={`comms-${photos.filter((p) => p.kind === "comms").length}`}
                phase={phase}
                kind="comms"
                slotLabel="связь"
              />
              <PhotoUploader
                key={`extra-${photos.filter((p) => p.kind === "extra").length}`}
                phase={phase}
                kind="extra"
                slotLabel="дефект"
              />
            </div>
          </details>
        </div>
      )}

      {photos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <PhotoThumb key={p.id} photo={p} deletable={editable} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">Пока нет снимков.</p>
      )}
    </div>
  );
}

// Форма открытия/закрытия с комментарием. Кнопка блокируется, пока нет пары
// «доска + крыло» (сервер проверяет то же — это подсказка, не единственный
// рубеж).
function FinishForm({
  action,
  photos,
  buttonLabel,
}: {
  action: typeof openShiftAction;
  photos: ShiftPhoto[];
  buttonLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const ready =
    photos.some((p) => p.kind === "board") && photos.some((p) => p.kind === "wing");

  return (
    <form action={formAction} className="mt-4 border-t border-line pt-4">
      <label className="block text-xs text-muted">
        Комментарий — необязательно
        <textarea
          name="comment"
          rows={2}
          className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>
      <button
        type="submit"
        disabled={pending || !ready}
        className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? "…" : buttonLabel}
      </button>
      {!ready && (
        <p className="mt-2 text-xs text-muted">Нужны снимок доски и снимок крыла.</p>
      )}
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

export function MechanicShiftPanel({
  shift,
  boards,
  wings,
}: {
  shift: InstructorShift | null;
  boards: EquipmentItem[];
  wings: EquipmentItem[];
}) {
  const openedAt = shift?.openedAt ?? null;
  const closedAt = shift?.closedAt ?? null;
  const openPhotos = shift?.photos.filter((p) => p.phase === "open") ?? [];
  const closePhotos = shift?.photos.filter((p) => p.phase === "close") ?? [];

  // Три стадии: смена не открыта → открыта, но не закрыта → закрыта.
  const stage: "open" | "close" | "done" = !openedAt
    ? "open"
    : !closedAt
      ? "close"
      : "done";

  const timeBadge =
    "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary";

  return (
    <div className="space-y-4">
      {/* Шапка: только факт и время, без оценок */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-bold">Сегодня</span>
          {openedAt ? (
            <span className={timeBadge}>открыта {vnTimeLabel(openedAt)}</span>
          ) : (
            <span className="text-sm text-muted">ещё не открыта</span>
          )}
          {closedAt && (
            <span className={timeBadge}>закрыта {vnTimeLabel(closedAt)}</span>
          )}
        </div>
      </section>

      {/* Открытие */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Открытие смены</h2>
        {shift?.openComment && (
          <p className="mt-1 text-sm text-muted">Комментарий: {shift.openComment}</p>
        )}
        <div className="mt-3">
          <PhaseSection
            phase="open"
            photos={openPhotos}
            boards={boards}
            wings={wings}
            editable={stage === "open"}
          />
        </div>
        {stage === "open" && (
          <FinishForm
            action={openShiftAction}
            photos={openPhotos}
            buttonLabel="Открыть смену"
          />
        )}
      </section>

      {/* Закрытие — доступно только после открытия */}
      {stage !== "open" && (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-bold">Закрытие смены</h2>
          {shift?.closeComment && (
            <p className="mt-1 text-sm text-muted">
              Комментарий: {shift.closeComment}
            </p>
          )}
          <div className="mt-3">
            <PhaseSection
              phase="close"
              photos={closePhotos}
              boards={boards}
              wings={wings}
              editable={stage === "close"}
            />
          </div>
          {stage === "close" && (
            <FinishForm
              action={closeShiftAction}
              photos={closePhotos}
              buttonLabel="Закрыть смену"
            />
          )}
        </section>
      )}
    </div>
  );
}
