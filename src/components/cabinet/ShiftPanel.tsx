"use client";

import Image from "next/image";
import { useActionState } from "react";
import {
  addShiftPhotoAction,
  deleteShiftPhotoAction,
  saveShiftCommentAction,
  type ShiftPhotoState,
} from "@/app/[locale]/instructor/actions";
import type { InstructorShift, PhotoKind, PhotoPhase, ShiftPhoto } from "@/lib/shifts";
import type { EquipmentItem } from "@/lib/equipment";
import { photoLabel, PHOTO_KIND_LABEL } from "@/lib/shiftRules";
import { vnTimeLabel } from "@/lib/dates";
import { Spinner } from "@/components/Spinner";
import { PhotoInput } from "./PhotoInput";
import { ShiftTimes } from "./ShiftTimes";
import { showToast } from "./Toast";

// Экран «Смена» — один на инструктора и механика (раньше лежал двумя почти
// одинаковыми копиями в кабинетах и, как водится, начал расходиться).
// Отличие ровно одно: strict — применять ли регламент 9:00/18:00. У механика
// его нет, поэтому у него просто время без «вовремя/поздно» (см. ShiftTimes).
//
// Правила с 27.07.2026 (см. шапку блока «Смена» в instructor/actions.ts):
//   утром — одно фото на пляже, оно же открывает смену;
//   вечером — одно фото у бара на выходе, оно же закрывает;
//   оборудование — по надобности, кому удобно, и только пока смена не закрыта.
//
// Кнопок «Открыть смену» и «Закрыть смену» больше нет: человек делал фото,
// уходил с экрана и терял выход, потому что кнопку не нажал.

// Один загрузчик снимка. key завязан на число уже сделанных кадров этого слота:
// после успешной загрузки счётчик растёт → форма перемонтируется → поля
// очищаются сами. При ошибке счётчик прежний, форма остаётся с текстом ошибки.
//
// Отдельной кнопки «Загрузить» нет: снимок засчитывается СРАЗУ при выборе файла
// (onChange дёргает form.requestSubmit(), он уважает required — для доски и
// крыла без выбранной единицы инвентаря браузер подсветит поле и не отправит).
function PhotoUploader({
  phase,
  kind,
  slotLabel,
  equipment,
  confirmText,
}: {
  phase: PhotoPhase;
  kind: PhotoKind;
  slotLabel: string;
  equipment?: EquipmentItem[];
  confirmText?: string;
}) {
  // Экшен оборачиваем, чтобы поймать успех и сказать, ЧТО именно произошло:
  // обязательный кадр не просто загрузился — он открыл или закрыл смену. Сама
  // форма после успеха перемонтируется, надпись внутри неё исчезла бы раньше,
  // чем её увидят; ToastHost живёт в макете кабинета.
  const [state, formAction, pending] = useActionState<ShiftPhotoState, FormData>(
    async (prev, formData) => {
      const result = await addShiftPhotoAction(prev, formData);
      if (!result.error) {
        showToast(
          result.opened
            ? "Смена открыта"
            : result.closed
              ? "Смена закрыта"
              : "Фото загружено",
        );
      }
      return result;
    },
    { error: null },
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="phase" value={phase} />
      <input type="hidden" name="kind" value={kind} />
      {equipment && (
        <label className="text-xs text-muted">
          {PHOTO_KIND_LABEL[kind]}
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
      <label className="min-w-0 flex-1 text-xs text-muted">
        {equipment ? `Снимок · ${slotLabel}` : slotLabel}
        {/* Кадр с камеры айфона весит 3–8 МБ и раньше отбивался лимитом тела
            запроса — PhotoInput жмёт его в браузере и только потом отправляет
            (пачка №10, п.1). */}
        <PhotoInput
          name="photo"
          capture="environment"
          required
          disabled={pending}
          autoSubmit
          confirmText={confirmText}
          className="mt-1 block w-full text-xs text-muted file:mr-3 file:rounded-full file:border-0 file:bg-line/50 file:px-3 file:py-1.5 file:text-xs file:font-semibold disabled:opacity-60"
        />
      </label>
      {pending && (
        <span className="flex items-center gap-1.5 pb-2 text-xs font-semibold text-primary">
          <Spinner className="h-3.5 w-3.5" />
          Загрузка…
        </span>
      )}
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

function PhotoThumb({ photo, deletable }: { photo: ShiftPhoto; deletable: boolean }) {
  const label = photo.equipmentName ?? photoLabel(photo.kind, photo.phase);
  return (
    <div className="relative">
      <Image
        src={photo.url}
        alt={label}
        width={96}
        height={96}
        unoptimized
        className="h-24 w-24 rounded-xl object-cover"
      />
      <span className="absolute inset-x-0 bottom-0 truncate rounded-b-xl bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {label}
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

// Необязательные снимки: оборудование и дефекты. Под раскрытием, чтобы не
// мозолили глаза — обычно от человека нужен только обязательный кадр, а доску
// снимает тот, кому в этот день удобно.
function ExtraShots({
  phase,
  photos,
  boards,
  wings,
}: {
  phase: PhotoPhase;
  photos: ShiftPhoto[];
  boards: EquipmentItem[];
  wings: EquipmentItem[];
}) {
  const count = (kind: PhotoKind) => photos.filter((p) => p.kind === kind).length;

  return (
    <details className="group mt-3 rounded-xl border border-line/60 bg-bg/40 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted">
        Снять оборудование — по надобности
        <span className="text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-3 px-3 pb-3">
        {boards.length > 0 && (
          <PhotoUploader
            key={`board-${count("board")}`}
            phase={phase}
            kind="board"
            slotLabel="доска"
            equipment={boards}
          />
        )}
        {wings.length > 0 && (
          <PhotoUploader
            key={`wing-${count("wing")}`}
            phase={phase}
            kind="wing"
            slotLabel="крыло"
            equipment={wings}
          />
        )}
        {boards.length === 0 && wings.length === 0 && (
          <p className="text-xs text-muted">
            Доски и крылья ещё не заведены — попросите админа добавить их в
            Настройках. Свободные кадры это не мешает делать.
          </p>
        )}
        <PhotoUploader
          key={`comms-${count("comms")}`}
          phase={phase}
          kind="comms"
          slotLabel="связь"
        />
        <PhotoUploader
          key={`extra-${count("extra")}`}
          phase={phase}
          kind="extra"
          slotLabel="дефект"
        />
      </div>
    </details>
  );
}

// Комментарий к фазе. Отдельная форма, а не поле рядом с кнопкой: кнопок больше
// нет, а объяснить «почему открыл позже 9:00» человек может и через час.
function CommentForm({
  phase,
  value,
}: {
  phase: PhotoPhase;
  value: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: { error: string | null }, formData: FormData) => {
      const result = await saveShiftCommentAction(prev, formData);
      if (!result.error) showToast("Комментарий сохранён");
      return result;
    },
    { error: null },
  );

  return (
    <form action={formAction} className="mt-4 border-t border-line pt-4">
      <input type="hidden" name="phase" value={phase} />
      <label className="block text-xs text-muted">
        {phase === "open"
          ? "Комментарий — например, почему открыли позже 9:00"
          : "Комментарий к закрытию — необязательно"}
        <textarea
          name="comment"
          rows={2}
          defaultValue={value ?? ""}
          className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="justify-center gap-2 mt-3 inline-flex items-center rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
      >
        {pending && <Spinner className="h-3.5 w-3.5" />}
        {pending && <Spinner />}
        {pending ? "Сохраняем…" : "Сохранить"}
      </button>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

// Обязательный кадр фазы — крупным блоком: это единственное, что человек обязан
// сделать, и именно он открывает или закрывает смену.
function RequiredShot({ phase }: { phase: PhotoPhase }) {
  const open = phase === "open";
  return (
    <div className="mt-3 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4">
      <p className="text-sm font-bold">
        {open ? "Фото на пляже" : "Фото у бара на выходе"}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        {open
          ? "Один кадр, что вы на работе. Смена откроется сразу — время проставится само, нажимать больше ничего не надо."
          : "Один кадр у бара, когда уходите с территории. Смена закроется сразу — оборудование вечером снимать не надо."}
      </p>
      <div className="mt-3">
        <PhotoUploader
          phase={phase}
          kind="checkin"
          slotLabel={open ? "снимок с пляжа" : "снимок у бара"}
          confirmText={
            open
              ? undefined
              : "Закрываем смену? После этого день считается законченным."
          }
        />
      </div>
    </div>
  );
}

export function ShiftPanel({
  shift,
  boards,
  wings,
  strict = true,
}: {
  shift: InstructorShift | null;
  boards: EquipmentItem[];
  wings: EquipmentItem[];
  /** Регламент 9:00/18:00: есть у инструктора, нет у механика. */
  strict?: boolean;
}) {
  const openedAt = shift?.openedAt ?? null;
  const closedAt = shift?.closedAt ?? null;
  const openPhotos = shift?.photos.filter((p) => p.phase === "open") ?? [];
  const closePhotos = shift?.photos.filter((p) => p.phase === "close") ?? [];
  // Пока смена не закрыта, любые необязательные кадры ещё принимаются.
  const live = !closedAt;

  return (
    <div className="space-y-4">
      {/* Шапка со статусом */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <span className="font-bold">Сегодня</span>
        <ShiftTimes openedAt={openedAt} closedAt={closedAt} strict={strict} />
        {shift && !shift.planned && (
          <p className="mt-1 text-xs text-muted">
            Незапланированный выход — админ смены на сегодня не ставил.
          </p>
        )}
      </section>

      {/* Открытие */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Открытие смены</h2>
        {openedAt ? (
          <p className="mt-1 text-sm text-muted">
            Смена открыта в {vnTimeLabel(openedAt)}.
          </p>
        ) : (
          <RequiredShot phase="open" />
        )}

        {live && (
          <ExtraShots
            phase="open"
            photos={openPhotos}
            boards={boards}
            wings={wings}
          />
        )}

        {openPhotos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {openPhotos.map((p) => (
              // Отметку о приходе не удаляем — это сам факт выхода (сервер
              // тоже откажет, но крестик не должен обманывать).
              <PhotoThumb key={p.id} photo={p} deletable={live && p.kind !== "checkin"} />
            ))}
          </div>
        )}

        {shift && <CommentForm phase="open" value={shift.openComment} />}
      </section>

      {/* Закрытие — доступно только после открытия */}
      {openedAt && (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-bold">Закрытие смены</h2>
          {closedAt ? (
            <p className="mt-1 text-sm text-muted">
              Смена закрыта в {vnTimeLabel(closedAt)}. На сегодня всё.
            </p>
          ) : (
            <RequiredShot phase="close" />
          )}

          {live && (
            <ExtraShots
              phase="close"
              photos={closePhotos}
              boards={boards}
              wings={wings}
            />
          )}

          {closePhotos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {closePhotos.map((p) => (
                <PhotoThumb
                  key={p.id}
                  photo={p}
                  deletable={live && p.kind !== "checkin"}
                />
              ))}
            </div>
          )}

          {shift && <CommentForm phase="close" value={shift.closeComment} />}
        </section>
      )}
    </div>
  );
}
