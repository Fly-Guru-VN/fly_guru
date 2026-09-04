import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container, Section } from "@/components/ui";
import { getAppUser, isLeftStaff, ROLE_HOME } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Вход",
  robots: { index: false, follow: false },
};

// Единый вход для всех ролей. После входа каждый попадает в свой кабинет
// (или обратно на страницу, с которой его выбросило, — параметр ?next=).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; closed?: string }>;
}) {
  const { next, closed } = await searchParams;

  // Уже залогинен — незачем показывать форму. Кроме уволенного (0036): его
  // кука ещё жива, но кабинет закрыт, и отправлять его «домой» нельзя —
  // requireRole вернёт сюда же, получится петля.
  const user = await getAppUser();
  if (user && !isLeftStaff(user)) redirect(ROLE_HOME[user.role]);
  const left = closed === "1" || Boolean(user && isLeftStaff(user));

  return (
    <Section className="pt-10 sm:pt-14">
      <Container>
        <div className="mx-auto max-w-sm">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Кабинет
          </p>
          <h1 className="text-3xl font-bold">Вход</h1>
          <p className="mt-2 text-sm text-muted">
            Для инструкторов, членов клуба и агентов. Нет аккаунта? Его создаёт
            администратор — напишите нам.
          </p>
          {left && (
            <p className="mt-4 rounded-2xl border border-line bg-line/20 p-3 text-sm">
              Доступ к кабинету закрыт: вы больше не числитесь в штате школы.
              Если это ошибка — напишите администратору.
            </p>
          )}
          <div className="mt-8">
            <LoginForm next={next} />
          </div>
        </div>
      </Container>
    </Section>
  );
}
