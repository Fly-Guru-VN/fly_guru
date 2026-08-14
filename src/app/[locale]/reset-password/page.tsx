import type { Metadata } from "next";
import { Container, Section } from "@/components/ui";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Новый пароль",
  robots: { index: false, follow: false },
};

// Второй шаг восстановления — сюда ведёт ссылка из письма. Токен приходит в
// адресе после решётки (#access_token=…), а всё, что после решётки, на сервер
// не попадает в принципе — читать его умеет только браузер. Поэтому вся работа
// в клиентском компоненте.
export default function ResetPasswordPage() {
  return (
    <Section className="pt-10 sm:pt-14">
      <Container>
        <div className="mx-auto max-w-sm">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Кабинет
          </p>
          <h1 className="text-3xl font-bold">Новый пароль</h1>
          <div className="mt-8">
            <ResetPasswordForm />
          </div>
        </div>
      </Container>
    </Section>
  );
}
