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
