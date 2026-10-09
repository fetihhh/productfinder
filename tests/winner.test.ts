import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32, deflateRawSync } from "node:zlib";
import { readSales } from "../dtc/sales.ts";
import type { FetchResult } from "../lib/http.ts";
import { ranksFor, unzipFirst } from "../lib/tranco.ts";
import { pricePoints, rankChange, rankPoints, reviewsPerMonth, toUsd, visitsFromRank, winnerScore } from "../lib/winner.ts";

/** Tek dosyalık, deflate ile sıkıştırılmış en küçük zip. */
function makeZip(name: string, content: string, dosDate: number): Buffer {
  const data = Buffer.from(content);
  const comp = deflateRawSync(data);
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc32(data), 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt16LE(dosDate, 14);
  cd.writeUInt32LE(crc32(data), 16);
  cd.writeUInt32LE(comp.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt32LE(0, 42);
  const cdOffset = local.length + nameBuf.length + comp.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length + nameBuf.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, nameBuf, comp, cd, nameBuf, eocd]);
}

test("unzipFirst: Tranco zip'ini açar ve liste tarihini okur", () => {
  const dosDate = ((2026 - 1980) << 9) | (10 << 5) | 8;
  const csv = "1,google.com\r\n2,cloudflare.com\r\n575487,mibrofit.com\r\n";
  const entry = unzipFirst(makeZip("top-1m.csv", csv, dosDate));
  assert.equal(entry.name, "top-1m.csv");
  assert.equal(entry.date, "2026-10-08");
  assert.equal(entry.data.toString("utf8"), csv);
});

test("ranksFor: yalnızca istenen alan adları, CRLF satır sonlarıyla", () => {
  const csv = "1,google.com\r\n2,cloudflare.com\r\n575487,mibrofit.com\r\n610593,nocsprovisions.com";
  const r = ranksFor(csv, ["mibrofit.com", "nocsprovisions.com", "tdmofficial.com"]);
  assert.deepEqual([...r.entries()], [["mibrofit.com", 575487], ["nocsprovisions.com", 610593]]);
});

test("visitsFromRank: sıra büyüdükçe ziyaret azalır, aralık ×0,5–×2", () => {
  const v = visitsFromRank(100_000);
  assert.ok(v.mid > 700_000 && v.mid < 800_000);
  assert.ok(Math.abs(v.low - v.mid / 2) <= 1 && Math.abs(v.high - v.mid * 2) <= 2);
  assert.ok(visitsFromRank(1_000_000).mid < v.mid);
});

test("reviewsPerMonth: en az 7 günlük veri gerekir ve aya ölçeklenir", () => {
  assert.equal(reviewsPerMonth([{ day: "2026-10-01", review_count: 100 }, { day: "2026-10-05", review_count: 110 }]), null);
  const rpm = reviewsPerMonth([
    { day: "2026-08-01", review_count: 10 }, // 30 günden eski → dikkate alınmaz
    { day: "2026-09-29", review_count: 100 },
    { day: "2026-10-09", review_count: 120 },
  ]);
  assert.equal(rpm, 60);
});

test("rankChange: sıra iyileşmesi oranı", () => {
  assert.equal(rankChange([{ day: "2026-09-29", rank: 600_000 }, { day: "2026-10-09", rank: 500_000 }]), 1.2);
  assert.equal(rankChange([{ day: "2026-10-08", rank: 600_000 }, { day: "2026-10-09", rank: 500_000 }]), null);
});

test("puan bileşenleri: trafik sırası ve fiyat bandı", () => {
  assert.equal(rankPoints(null), 0);
  assert.equal(rankPoints(30_000), 1);
  assert.ok(Math.abs(rankPoints(1_000_000) - 0.1) < 1e-9);
  assert.equal(pricePoints(toUsd(129, "USD")), 10);
  assert.equal(pricePoints(toUsd(200, "EUR")), 5);
  assert.equal(pricePoints(toUsd(5, "USD")), 0);
  assert.equal(toUsd(10, "XYZ"), null);
});

test("winnerScore: bileşenler ve satış tahminleri", () => {
  const { score, breakdown } = winnerScore({
    reviewCount: 999,
    rating: 4.6,
    price: 100,
    currency: "USD",
    trendScore: 40,
    ranks: [{ day: "2026-09-29", rank: 36_000 }, { day: "2026-10-09", rank: 30_000 }],
    snapshots: [{ day: "2026-09-29", review_count: 969 }, { day: "2026-10-09", review_count: 999 }],
  });
  assert.deepEqual(breakdown.parts, { talep: 30, ivme: 25, trafik: 20, gundem: 6, fiyat: 10 });
  assert.equal(score, 91);
  assert.deepEqual(breakdown.sales, { low: 9990, high: 49950 });
  assert.equal(breakdown.reviewsPerMonth, 90);
  assert.deepEqual(breakdown.salesPerMonth, { low: 900, high: 4500 });
  assert.deepEqual(breakdown.revenuePerMonth, { low: 90_000, high: 450_000 });
  assert.equal(breakdown.historyDays, 2);
});

test("winnerScore: veri yoksa yalnızca gündem puanı", () => {
  const { score, breakdown } = winnerScore({
    reviewCount: null, rating: null, price: null, currency: null, trendScore: 20, ranks: [], snapshots: [],
  });
  assert.equal(score, 3);
  assert.equal(breakdown.visits, null);
  assert.equal(breakdown.sales, null);
  assert.equal(breakdown.salesPerMonth, null);
});

test("readSales: ürün JSON'u ve Yotpo özetinden günlük ölçüm", async () => {
  const BASE = "https://shop.example.com";
  const ok = (url: string, text: string): FetchResult => ({ ok: true, status: 200, url, contentType: "", text });
  const pages: Record<string, FetchResult> = {
    [`${BASE}/products/lamp`]: ok(
      `${BASE}/products/lamp`,
      `<script src="https://cdn-widgetsrepository.yotpo.com/v1/loader/ABCDEFGHIJKLMNOPQRSTUVWX"></script>
       <script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Lamp", offers: { "@type": "Offer", price: "59.00", priceCurrency: "USD", availability: "https://schema.org/InStock" } })}</script>`,
    ),
    [`${BASE}/products/lamp.json`]: ok("j", JSON.stringify({ product: { id: 7, title: "Lamp", variants: [{ price: "49.00" }] } })),
    ["https://api-cdn.yotpo.com/products/ABCDEFGHIJKLMNOPQRSTUVWX/7/bottomline"]: ok(
      "y",
      JSON.stringify({ response: { bottomline: { total_reviews: 88, average_score: 4.4 } } }),
    ),
  };
  const r = await readSales(`${BASE}/products/lamp`, async (u) => pages[u] ?? { ok: false, url: u, reason: "404", retryable: false });
  assert.ok(r.ok);
  assert.deepEqual(r.sales, { price: 49, currency: "USD", reviewCount: 88, rating: 4.4, availability: "InStock" });
});
