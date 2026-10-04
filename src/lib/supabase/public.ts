import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Клиент «как посетитель сайта»: публичный ключ, без сессии и без кук.
//
// Зачем отдельный, когда есть createAdminClient. Служебный ключ обходит RLS, и
// с ним публичная страница журнала держалась бы только на условии в коде
// (status = 'published'). Забудь его в одном запросе — и черновик ушёл бы в
// интернет. С этим ключом база сама отдаёт только опубликованное (0064).
//
// Без кук — чтобы страница оставалась статичной: чтение cookies() делает
// страницу динамической, и Next перестал бы кэшировать её.
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
