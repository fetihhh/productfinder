// Günlük işin "alan adı kaydı" adımı: kayıt tarihi bilinmeyen açık mağazalar için RDAP (rdap.org → kayıt kuruluşunun
// RDAP sunucusu). Saniyede en fazla 1 istek; robots.txt'ye uyulur.
import { parseRdap, rdapUrl } from "../dtc/rdap.ts";
import { politeFetch } from "../lib/http.ts";
import { saveRdap, storesWithoutRdap } from "../lib/stores.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function rdapLookups(limit = 120): Promise<void> {
  const domains = await storesWithoutRdap(limit);
  console.log(`\n▶ Alan adı kaydı (RDAP): ${domains.length} mağaza`);
  let found = 0;
  let failed = 0;
  for (const d of domains) {
    const r = await politeFetch(rdapUrl(d), "application/rdap+json, application/json");
    if (!r.ok) {
      failed++;
      // Geçici hata: tarih yazılmaz, sonraki çalıştırmada yeniden denenir.
      if (!r.retryable) await saveRdap(d, null);
      if (failed >= 15 && found === 0) {
        console.error(`  ✖ RDAP yanıt vermiyor (${r.reason}); durduruldu`);
        break;
      }
      continue;
    }
    const info = parseRdap(r.text);
    await saveRdap(d, info);
    if (info?.registered) found++;
    await sleep(1000);
  }
  console.log(`  özet: ${found} mağazanın kayıt tarihi bulundu${failed ? `, ${failed} sorgu başarısız` : ""}`);
}
