import { test } from "node:test";
import assert from "node:assert/strict";
import { onlyDomains, searchChain, type SearchFn } from "../dtc/marketplaceSearch.ts";

const ok = (url: string): SearchFn => async () => ({ ok: true, results: [{ title: "x", url, content: "" }] });
const quota: SearchFn = async () => ({ ok: false, quota: true, reason: "HTTP 432" });

test("searchChain: kotası dolan servis atlanır, sıradakine geçilir; hepsi doluysa kota hatası", async () => {
  const used: string[] = [];
  const gate = (name: string, open: boolean) => async () => (used.push(name), open);
  const chain = searchChain([
    { name: "Tavily", search: ok("https://a.com/1"), gate: gate("Tavily", false) },
    { name: "Exa", search: quota, gate: gate("Exa", true) },
    { name: "Firecrawl", search: ok("https://www.amazon.de/dp/X"), gate: gate("Firecrawl", true) },
  ])!;
  const r = await chain("q");
  assert.deepEqual(used, ["Tavily", "Exa", "Firecrawl"]);
  assert.equal(r.ok && r.results[0].url, "https://www.amazon.de/dp/X");
  const none = searchChain([{ name: "Tavily", search: ok("https://a.com"), gate: async () => false }])!;
  const n = await none("q");
  assert.equal(n.ok, false);
  assert.equal(!n.ok && n.quota, true);
  assert.equal(searchChain([]), null);
});

test("onlyDomains: yalnızca verilen siteler (alt alan adları dahil)", () => {
  const r = onlyDomains(
    [
      { title: "a", url: "https://www.amazon.de/dp/1", content: "" },
      { title: "b", url: "https://blog.example.com/x", content: "" },
      { title: "c", url: "notaurl", content: "" },
    ],
    ["amazon.de"],
  );
  assert.deepEqual(r.map((x) => x.title), ["a"]);
});
