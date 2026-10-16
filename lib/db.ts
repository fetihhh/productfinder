import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Yalnızca sunucuda (server component/action, cron script) kullanılır.
// SUPABASE_SECRET_KEY RLS'i aşar; asla NEXT_PUBLIC_ önekiyle tanımlamayın.
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL ve SUPABASE_SECRET_KEY tanımlı olmalı (.env.local)");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

type Rows<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Supabase tek istekte en fazla 1.000 satır döndürür. Ürünler, anlık görüntüler, trafik sıraları ve markalar bunu aştı:
 * tablonun tamamını okuması gereken sorgular bununla sayfa sayfa okunur. Sayfalar kaymasın diye sorgu benzersiz bir
 * sütuna göre sıralanmalı.
 */
export async function allRows<T>(build: (from: number, to: number) => PromiseLike<Rows<T>>): Promise<Rows<T>> {
  const data: T[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await build(from, from + 999);
    if (page.error) return { data: null, error: page.error };
    data.push(...(page.data ?? []));
    if (!page.data || page.data.length < 1000) return { data, error: null };
  }
}
