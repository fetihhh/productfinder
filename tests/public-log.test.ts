import { test } from "node:test";
import assert from "node:assert/strict";
import { publicLines, redact } from "../scripts/publicLog.ts";

test("publicLines: GitHub kaydında yalnızca başlıklar ve özetler; ürün/mağaza satırları ve adresler yok", () => {
  const log = [
    "▶ DTC doğrulama: 66 ürün",
    "  ? Coast QB2R [coastportland.com] — Marka sitesi okunamadı: HTTP 429",
    "  ✔ Galaxy Projector [getcosmora.com] — doğrulandı",
    '  özet: {"verified":59,"rejected_marketplace":5}',
    "  durum: see https://example.com/x and shop.example.store",
  ].join("\n");
  assert.deepEqual(publicLines(log), ["▶ DTC doğrulama: 66 ürün", '  özet: {"verified":59,"rejected_marketplace":5}', "  durum: see [adres] and [site]"]);
  assert.equal(redact("getcosmora.com"), "[site]");
});
