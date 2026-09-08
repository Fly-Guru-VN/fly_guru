// Экран «Сертификаты» — подарочные сертификаты школы (0059).
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveServices } from "@/lib/services";
import { failIfReadError } from "@/lib/dbError";
import { certificateStatus, formatCertificateCode } from "@/lib/certificateCode";
import { dayLabel, momentDay } from "@/lib/dates";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { deleteCertificateAction, releaseCertificateAction } from "../actions";
import { CertificateCreateForm } from "./CertificateCreateForm";

// Как это живёт целиком. Школа продаёт бумажный бланк; админ заводит его
// здесь — имя, телефон, услуга и номер, который потом пишут на бланке рукой.
// Гость вводит номер в форме записи на сайте, услуга подставляется сама, и
// заявка дальше идёт обычным порядком.
//
// Два правила начальника (08.09.2026): сертификат живёт ТРИ МЕСЯЦА со дня
// создания и СГОРАЕТ при использовании. Гасится он в момент подачи заявки —
// поэтому у отменённой заявки сертификат возвращают в оборот кнопкой.
//
// Таблица закрыта RLS наглухо, читаем служебным ключом: доступ сюда решает
// requireRole в layout админки, а не политика (см. 0059).

interface Row {
  id: string;
  code: string;
  client_name: string;
  phone: string;
  issued_at: string;
  expires_at: string;
  used_at: string | null;
  note: string | null;
  services: { name: string } | null;
}

const STATUS_LABEL = {
  active: "Действует",
  used: "Погашен",
  expired: "Просрочен",
} as const;

const STATUS_CLASS = {
  active: "bg-emerald-500/10 text-emerald-600",
  used: "bg-line/60 text-muted",
  expired: "bg-amber-500/10 text-amber-600",
} as const;

export async function CertificatesScreen() {
  const supabase = createAdminClient();
  const [services, certificates] = await Promise.all([
    getActiveServices(),
    supabase
      .from("certificates")
      .select("id, code, client_name, phone, issued_at, expires_at, used_at, note, services(name)")
      .order("issued_at", { ascending: false })
      .limit(200),
  ]);
  failIfReadError(certificates.error, "не удалось прочитать сертификаты");
  const rows = (certificates.data ?? []) as unknown as Row[];

  const active = rows.filter((r) => certificateStatus(r) === "active").length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Сертификаты"
        hint={`Подарочные сертификаты на конкретную услугу · ${active} действует`}
      />
      <PageNote>
        <p>
          Номер придумывает CRM (или впишите свой) — его же пишут на бумажном
          бланке. Гость вводит номер в форме записи на сайте, и услуга
          подставляется сама.
        </p>
        <p>
          Сертификат действует 3 месяца со дня создания и сгорает, как только по
          нему подали заявку. Заявку отменили — верните сертификат в оборот
          кнопкой в его строке.
        </p>
      </PageNote>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="mb-3 text-sm font-bold">Новый сертификат</p>
        <CertificateCreateForm services={services} />
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted">Сертификатов пока нет.</p>
      )}

      <div className="space-y-2">
        {rows.map((row) => {
          const status = certificateStatus(row);
          return (
            <div
              key={row.id}
              className={`rounded-2xl border border-line bg-surface p-4 ${
                status === "active" ? "" : "opacity-70"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold">{formatCertificateCode(row.code)}</p>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_CLASS[status]}`}
                >
                  {STATUS_LABEL[status]}
                </span>
              </div>

              <p className="mt-1 text-sm">
                {row.services?.name ?? "услуга удалена"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {row.client_name} · {row.phone}
              </p>
              <p className="mt-1 text-xs text-muted">
                выдан {dayLabel(momentDay(row.issued_at))} · действует до{" "}
                {dayLabel(momentDay(row.expires_at))}
                {row.used_at ? ` · погашен ${dayLabel(momentDay(row.used_at))}` : ""}
              </p>
              {row.note && <p className="mt-1 text-xs text-muted">{row.note}</p>}

              <div className="mt-3 flex items-center gap-3">
                {status === "used" && (
                  <form action={releaseCertificateAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <ConfirmSubmit
                      message="Вернуть сертификат в оборот? Им снова можно будет записаться."
                      className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-primary"
                    >
                      Вернуть в оборот
                    </ConfirmSubmit>
                  </form>
                )}
                <form action={deleteCertificateAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <ConfirmSubmit
                    message="Удалить сертификат? Отменить это нельзя."
                    className="text-sm text-muted transition-colors hover:text-red-500"
                  >
                    Удалить
                  </ConfirmSubmit>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
