import type { Metadata } from "next";
import { Container, Section } from "@/components/ui";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

// В индексе странице делать нечего: сюда приходят только свои и только по
// ссылке со страницы входа.
export const metadata: Metadata = {
  title: "Восстановление пароля",
  robots: { index: false, follow: false },
};

// Первый шаг восстановления: человек вводит логин, мы шлём письмо со ссылкой.
// Второй шаг — /reset-password, туда ведёт ссылка из письма.
export default function ForgotPasswordPage() {
  return (
    <Section className="pt-10 sm:pt-14">
      <Container>
        <div className="mx-auto max-w-sm">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Кабинет
          </p>
          <h1 className="text-3xl font-bold">Забыли пароль?</h1>
          <p className="mt-2 text-sm text-muted">
            Введите email или телефон, с которым заходите в кабинет. Пришлём
            письмо со ссылкой — по ней зададите новый пароль.
          </p>
          <div className="mt-8">
            <ForgotPasswordForm />
          </div>
        </div>
      </Container>
    </Section>
  );
}
