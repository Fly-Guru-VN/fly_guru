import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Клиент для серверных компонентов, Route Handlers и Server Actions.
// Читает/пишет сессию через cookies — понадобится на Этапе 3 (auth + RLS).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Вызов из Server Component — записать cookie нельзя.
            // Это норма, если сессию обновляет proxy.ts. Игнорируем.
          }
        },
      },
    },
  );
}
