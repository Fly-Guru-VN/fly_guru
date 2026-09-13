"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { BookBtn } from "../BookBtn";
import { IconLock } from "../icons";
import { buttonClasses } from "../ui";

// Замок на разделе, который ещё не открыт гостям (магазин, см.
// SHOP_IN_DEVELOPMENT). Гость видит один экран страницы под размытием и
// карточку «Страница в разработке»; вошедший сотрудник — страницу целиком.
//
// Проверка в браузере, как у кнопки «Кабинет» в шапке: страницы статические, и
// сервер не знает, кто зашёл. Сессию supabase читает из куки локально, а
// строку в users отдаёт RLS только владельцу — то есть открывается страница
// тем, у кого есть кабинет. До проверки замок стоит у всех: гостям (почти все
// посетители) ничего не мигает, мигает только у своих.
//
// Это «закрыто на ремонт», а не защита данных: в разметке каталог есть, и
// снять размытие можно инструментами браузера. Секретов там нет — розничные
// цены Lift и так публичные.
export function ShopDevLock({ children }: { children: ReactNode }) {
  const t = useTranslations("ShopLock");
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session) return;
      const { data: row } = await supabase
        .from("users")
        .select("role")
        .eq("auth_id", session.user.id)
        .maybeSingle();
      if (!cancelled && row?.role) setUnlocked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (unlocked) return <>{children}</>;

  return (
    <div className="relative">
      {/* Под замком — только первый экран: листать размытую простыню до низа
          незачем. inert убирает её из клавиатуры и читалки экрана, чтобы Tab
          не уводил фокус на невидимые кнопки «Купить». */}
      <div
        inert
        aria-hidden
        className="pointer-events-none max-h-[85dvh] select-none overflow-hidden blur-[5px]"
      >
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/35 px-4">
        <div className="animate-pop-in w-full max-w-md rounded-3xl border border-line bg-surface p-7 text-center shadow-[0_24px_60px_-28px_rgba(15,34,51,0.55)] sm:p-9">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <IconLock aria-hidden className="h-7 w-7" />
          </span>
          <h1 className="mt-5 text-2xl font-bold sm:text-3xl">{t("title")}</h1>
          <p className="mt-2 text-muted">{t("text")}</p>
          <div className="mt-6 flex flex-col gap-3">
            <BookBtn place="shop-lock" size="lg" className="w-full">
              {t("book")}
            </BookBtn>
            <Link href="/" className={buttonClasses({ variant: "ghost", className: "w-full" })}>
              {t("home")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
