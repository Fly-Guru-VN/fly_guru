"use client";

import Image from "next/image";
import { useActionState } from "react";
import {
  addShiftPhotoAction,
  deleteShiftPhotoAction,
  openShiftAction,
  closeShiftAction,
} from "../actions";
import type { InstructorShift, PhotoKind, PhotoPhase, ShiftPhoto } from "@/lib/shifts";
import type { EquipmentItem } from "@/lib/equipment";
import {
  shiftStatus,
  OPEN_LABEL,
  CLOSE_LABEL,
  statusClass,
  PHOTO_KIND_LABEL as KIND_LABEL,
} from "@/lib/shiftRules";
import { vnTimeLabel } from "@/lib/dates";
import { PhotoInput } from "@/components/cabinet/PhotoInput";
import { showToast } from "@/components/cabinet/Toast";

// Экран смены целиком клиентский: несколько независимых форм загрузки фото
// (каждая — свой useActionState ради ошибки под кнопкой), удаление кадра,
// открытие и закрытие. Данные приходят с сервера; после каждого действия
// revalidatePath перерисовывает их, и счётчики фото обновляются сами.

// Один загрузчик снимка. key завязан на число уже сделанных кадров этого слота:
// после успешной загрузки счётчик растёт → форма перемонтируется → поля
// очищаются сами. При ошибке счётчик прежний, форма остаётся с текстом ошибки.
//
// Отдельной кнопки «+» нет: снимок засчитывается СРАЗУ при выборе файла —
// onChange дёргает form.requestSubmit() (он уважает required, так что для
// доски/крыла без выбранной единицы инвентаря браузер подсветит поле и не
// отправит). Так инструктор не делает лишнего действия и не забывает нажать.
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
  // Экшен оборачиваем, чтобы поймать успех и показать уведомление: сама форма
  // сразу после успеха перемонтируется (key в PhaseSection), и надпись внутри
  // неё исчезла бы раньше, чем её увидят. ToastHost живёт в макете кабинета.
  const [state, formAction, pending] = useActionState(
    async (prev: { error: string | null }, formData: FormData) => {
      const result = await addShiftPhotoAction(prev, formData);
      if (!result.error) showToast("Фото загружено");
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
        {/* Кадр с камеры айфона весит 3–8 МБ и раньше отбивался лимитом тела
            запроса — PhotoInput жмёт его в браузере и только потом отправляет
            (пачка №10, п.1). */}
        <PhotoInput
          name="photo"
          capture="environment"
          required
          disabled={pending}
          autoSubmit
          className="mt-1 block w-full text-xs text-muted file:mr-3 file:rounded-full file:border-0 file:bg-line/50 file:px-3 file:py-1.5 file:text-xs file:font-semibold disabled:opacity-60"
        />
      </label>
      {pending && (
        <span className="pb-2 text-xs font-semibold text-primary">Загрузка…</span>
      )}
      {state.error && (
        <p className="w-full text-xs text-red-600">{state.error}</p>
      )}
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
//
// senior=false — второй инструктор на смене (0033): оборудование осматривает
// старший, поэтому вместо доски и крыла один слот «вы на пляже».
function PhaseSection({
  phase,
  photos,
  boards,
  wings,
  editable,
  senior,
}: {
  phase: PhotoPhase;
  photos: ShiftPhoto[];
  boards: EquipmentItem[];
  wings: EquipmentItem[];
  editable: boolean;
  senior: boolean;
}) {
  return (
    <div className="space-y-4">
      {editable && (
        <div className="space-y-3">
          {/* Обязательные слоты на виду. Слоты открываем через key от числа
              кадров — форма очищается сама после успешной загрузки. */}
          {senior ? (
            <>
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
            </>
          ) : (
            <PhotoUploader
              key={`checkin-${photos.filter((p) => p.kind === "checkin").length}`}
              phase={phase}
              kind="checkin"
              slotLabel={phase === "open" ? "вы на пляже" : "вы уходите"}
            />
          )}
          {/* Необязательные снимки (связь, дефекты) убраны под раскрытие —
              обычно нужны только доска и крыло, остальное не мозолит глаза. */}
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

// Форма открытия/закрытия с комментарием. Кнопка блокируется, пока не сделаны
// нужные снимки: старшему — пара «доска + крыло», второму — один любой кадр
// (сервер проверяет то же самое — это подсказка, не единственный рубеж).
function FinishForm({
  action,
  photos,
  buttonLabel,
  commentHint,
  senior,
}: {
  action: typeof openShiftAction;
  photos: ShiftPhoto[];
  buttonLabel: string;
  commentHint: string;
  senior: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const ready = senior
    ? photos.some((p) => p.kind === "board") && photos.some((p) => p.kind === "wing")
    : photos.length > 0;

  return (
    <form action={formAction} className="mt-4 border-t border-line pt-4">
      <label className="block text-xs text-muted">
        {commentHint}
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
        <p className="mt-2 text-xs text-muted">
          {senior
            ? "Нужны снимок доски и снимок крыла."
            : "Нужно одно фото — что вы на месте."}
        </p>
      )}
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

export function ShiftPanel({
  shift,
  boards,
  wings,
  senior,
}: {
  shift: InstructorShift | null;
  boards: EquipmentItem[];
  wings: EquipmentItem[];
  /** Старший на смене осматривает оборудование, второй просто отмечается (0033). */
  senior: boolean;
}) {
  const openedAt = shift?.openedAt ?? null;
  const closedAt = shift?.closedAt ?? null;
  const status = shiftStatus(openedAt, closedAt);
  const openPhotos = shift?.photos.filter((p) => p.phase === "open") ?? [];
  const closePhotos = shift?.photos.filter((p) => p.phase === "close") ?? [];

  // Три стадии: смена не открыта → открыта, но не закрыта → закрыта.
  const stage: "open" | "close" | "done" = !openedAt
    ? "open"
    : !closedAt
      ? "close"
      : "done";

  return (
    <div className="space-y-4">
      {/* Шапка со статусом */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-bold">Сегодня</span>
          {openedAt ? (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(
                status.open === "late",
              )}`}
            >
              открыта {vnTimeLabel(openedAt)} · {OPEN_LABEL[status.open]}
            </span>
          ) : (
            <span className="text-sm text-muted">ещё не открыта</span>
          )}
          {closedAt && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(
                status.close === "early",
              )}`}
            >
              закрыта {vnTimeLabel(closedAt)} · {CLOSE_LABEL[status.close]}
            </span>
          )}
        </div>
        {shift && !shift.planned && (
          <p className="mt-1 text-xs text-muted">
            Незапланированный выход — админ смены на сегодня не ставил.
          </p>
        )}
      </section>

      {/* Открытие */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">
          {senior ? "Открытие смены" : "Отметка о приходе"}
        </h2>
        {!senior && (
          <p className="mt-1 text-sm text-muted">
            Доску и крыло снимает старший инструктор. С вас одно фото, что вы на
            пляже — по нему засчитывается выход.
          </p>
        )}
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
            senior={senior}
          />
        </div>
        {stage === "open" && (
          <FinishForm
            action={openShiftAction}
            photos={openPhotos}
            buttonLabel={senior ? "Открыть смену" : "Я на месте"}
            commentHint="Комментарий (например, почему открыл позже 9:00) — необязательно"
            senior={senior}
          />
        )}
      </section>

      {/* Закрытие — доступно только после открытия */}
      {stage !== "open" && (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-bold">
            {senior ? "Закрытие смены" : "Отметка об уходе"}
          </h2>
          {!senior && (
            <p className="mt-1 text-sm text-muted">
              Одно фото на прощание — без него выход не закроется, а закрытие
              нужно, чтобы за смену заплатили.
            </p>
          )}
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
              senior={senior}
            />
          </div>
          {stage === "close" && (
            <FinishForm
              action={closeShiftAction}
              photos={closePhotos}
              buttonLabel={senior ? "Закрыть смену" : "Я ухожу"}
              commentHint="Комментарий к закрытию — необязательно"
              senior={senior}
            />
          )}
        </section>
      )}
    </div>
  );
}
