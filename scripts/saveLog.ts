// Günlük işin ayrıntılı kaydını Supabase'deki job_logs tablosuna yazar (yalnızca gizli anahtarla okunur; GitHub'da
// görünmez). Son 60 kayıt tutulur (~4 gün).
import { readFileSync } from "node:fs";
import { db } from "../lib/db.ts";

const file = process.argv[2];
let log = "";
try {
  log = readFileSync(file, "utf8");
} catch {
  log = "(kayıt dosyası yok)";
}
// Supabase satır boyutu için son ~900 KB tutulur (baştaki test çıktısı en az önemli kısım).
if (log.length > 900_000) log = `…\n${log.slice(-900_000)}`;
const { error } = await db()
  .from("job_logs")
  .insert({ run_id: process.env.RUN_ID ?? null, mode: process.env.INGEST_MODE || "full", ok: process.env.INGEST_OK === "0", log });
if (error) {
  console.error(`job_logs yazılamadı: ${error.message}`);
  process.exit(0);
}
const { data } = await db().from("job_logs").select("id").order("id", { ascending: false }).range(60, 60);
if (data?.[0]) await db().from("job_logs").delete().lte("id", data[0].id);
console.log("Ayrıntılı kayıt Supabase job_logs tablosuna yazıldı.");
