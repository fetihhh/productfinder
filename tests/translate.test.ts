import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMyMemory, sourceLang } from "../lib/translate.ts";

test("sourceLang: mağaza ülkesinden dil; İngilizce ve çok dilli ülkeler çevrilmez", () => {
  assert.equal(sourceLang("ES"), "es");
  assert.equal(sourceLang("fr"), "fr");
  assert.equal(sourceLang("BR"), "pt");
  assert.equal(sourceLang("US"), null);
  assert.equal(sourceLang("BE"), null);
  assert.equal(sourceLang(null), null);
});

test("parseMyMemory: çeviri, kota/uyarı ve aynı metin", () => {
  const ok = JSON.stringify({ responseData: { translatedText: "Home Night Projector" }, responseStatus: 200, quotaFinished: false });
  assert.equal(parseMyMemory(ok, "Proyector Nocturno para el Hogar"), "Home Night Projector");
  assert.equal(parseMyMemory(JSON.stringify({ responseData: { translatedText: "x" }, responseStatus: 200, quotaFinished: true }), "y"), null);
  assert.equal(parseMyMemory(JSON.stringify({ responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY" }, responseStatus: 429 }), "y"), null);
  assert.equal(parseMyMemory(JSON.stringify({ responseData: { translatedText: "Calmi Ring" }, responseStatus: "200" }), "calmi ring"), null);
  assert.equal(parseMyMemory("<html>", "y"), null);
});