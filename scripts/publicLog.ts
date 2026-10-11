// Depo herkese açık olduğu için GitHub Actions kaydında yalnızca adım başlıkları ve sayılar gösterilir: ürün adları, mağaza
// ve site adresleri, reklam metinleri yazılmaz (ayrıntılı kayıt Supabase'deki job_logs tablosuna gider: scripts/saveLog.ts).
import { readFileSync } from "node:fs";

const SAFE = /^(▶|\s*(özet:|durum:|! Shopify|! Kota|! Instagram durduruldu|✖ Aramalar durduruldu|✖ RDAP|\d+ (alan adı|hesap|mağaza) (aranacak|okunacak)))/;

/** Yalnızca başlık/özet satırları geçer (ürün ve mağaza satırları hiç yazılmaz); yine de satırdaki adresler ve alan adları maskelenir. */
export function redact(line: string): string {
  return line
    .replace(/https?:\/\/\S+/g, "[adres]")
    .replace(/\b(?:[a-z0-9-]+\.)+(?:com|net|org|shop|store|co|io|de|fr|es|it|nl|eu|uk|us|tr|online|app|xyz)\b/gi, "[site]");
}

export function publicLines(log: string): string[] {
  return log
    .split("\n")
    .filter((l) => SAFE.test(l))
    .map(redact);
}

if (process.argv[2]) {
  let text = "";
  try {
    text = readFileSync(process.argv[2], "utf8");
  } catch {
    console.log("(kayıt dosyası yok)");
    process.exit(0);
  }
  console.log(publicLines(text).join("\n"));
}
