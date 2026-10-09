import { test } from "node:test";
import assert from "node:assert/strict";
import { trendScore } from "../lib/score.ts";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

test("Bahsedilme yoksa skor 0", () => {
  assert.equal(trendScore([], NOW).score, 0);
});

test("Tek blogda bu hafta bir kez: 13.3 + 10 + 6", () => {
  const r = trendScore([{ source: "coolthings", posted_at: daysAgo(1) }], NOW);
  assert.equal(r.score, 29.3);
  assert.deepEqual(r.breakdown.parts, { kaynak: 13.3, artis: 10, hacim: 6 });
});

test("Üç farklı blog, hepsi bu hafta → kaynak ve artış dolar", () => {
  const r = trendScore(
    [
      { source: "a", posted_at: daysAgo(1) },
      { source: "b", posted_at: daysAgo(2) },
      { source: "c", posted_at: daysAgo(3) },
    ],
    NOW,
  );
  assert.equal(r.breakdown.parts.kaynak, 40);
  assert.equal(r.breakdown.parts.artis, 30);
  assert.equal(r.breakdown.parts.hacim, 18);
  assert.equal(r.score, 88);
});

test("Eski bahsedilmeler artış getirmez; 30 günden eskiler hacme sayılmaz", () => {
  const r = trendScore(
    [
      { source: "a", posted_at: daysAgo(20) },
      { source: "a", posted_at: daysAgo(25) },
      { source: "a", posted_at: daysAgo(40) },
    ],
    NOW,
  );
  assert.equal(r.breakdown.m7, 0);
  assert.equal(r.breakdown.m30, 2);
  assert.equal(r.breakdown.parts.artis, 0);
  assert.equal(r.score, 25.3);
});
