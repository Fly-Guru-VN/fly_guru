import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isShiftPhotoStoragePath } from "@/lib/photos";

// Чистилка фото смен (пак C). Снимки нужны боссу пару дней — понять, на чьей
// смене случилась поломка. Дальше это мёртвый груз: держать их вечно = платить
// за хранение сотен фото воды. Крон раз в сутки сносит всё старше 3 дней —
// сначала файлы из бакета, потом строки.
//
// /api не проходит через proxy.ts — защищаемся секретом (Vercel шлёт Authorization: Bearer
// <CRON_SECRET>) и ходим service_role клиентом. Без секрета роут не работает
// вообще: иначе чужой человек мог бы снести фото смен одной ссылкой.

const MAX_AGE_DAYS = 3;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron cleanup] CRON_SECRET не задан — запрос отклонён");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(
    Date.now() - MAX_AGE_DAYS * 24 * 3600 * 1000,
  ).toISOString();
  const supabase = createAdminClient();

  const { data: stale, error: selError } = await supabase
    .from("shift_photos")
    .select("id, shift_id, phase, kind, path")
    .lt("created_at", cutoff);
  if (selError) {
    console.error("[cron cleanup] select error:", selError.message);
    return NextResponse.json({ error: selError.message }, { status: 500 });
  }
  if (!stale || stale.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  // Таблица доступна сотрудникам на insert через RLS. Даже если кто-то
  // обойдёт интерфейс и подложит в свою строку путь чужого объекта, cron с
  // service_role не должен становиться «удалителем» этого объекта.
  if (stale.some((photo) => !isShiftPhotoStoragePath(photo))) {
    console.error("[cron cleanup] unsafe shift photo path; cleanup aborted");
    return NextResponse.json({ error: "unsafe_photo_path" }, { status: 500 });
  }

  // Сначала файлы: если следом упадёт удаление строк, повторный запуск просто
  // не найдёт уже снесённые объекты — remove по несуществующим путям безопасен.
  const paths = stale.map((p) => p.path as string);
  const { error: rmError } = await supabase.storage.from("shifts").remove(paths);
  if (rmError) {
    console.error("[cron cleanup] storage remove error:", rmError.message);
    // Строки сохраняем: именно в них лежат пути для повторной попытки. Если
    // удалить их сейчас, осиротевшие файлы следующий запуск уже не найдёт.
    // Повтор remove безопасен и для объектов, которые успели удалиться частично.
    return NextResponse.json({ error: rmError.message }, { status: 500 });
  }

  const ids = stale.map((p) => p.id as string);
  const { error: delError } = await supabase
    .from("shift_photos")
    .delete()
    .in("id", ids);
  if (delError) {
    console.error("[cron cleanup] rows delete error:", delError.message);
    return NextResponse.json({ error: delError.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: ids.length });
}
