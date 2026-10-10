import { test } from "node:test";
import assert from "node:assert/strict";
import { politeFetch } from "../lib/http.ts";

test("politeFetch: robots.txt 429 → geçici hata (yasak değil), önbelleğe alınmaz; 403 → kalıcı yasak", async () => {
  const real = globalThis.fetch;
  let robotsStatus = 429;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname === "/robots.txt") return new Response(robotsStatus === 200 ? "User-agent: *\nDisallow:\n" : "", { status: robotsStatus });
    return new Response('{"products":[]}', { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const first = await politeFetch("https://throttled.test/products.json", "application/json");
    assert.equal(first.ok, false);
    assert.ok(!first.ok && first.retryable && /geçici/.test(first.reason), !first.ok ? first.reason : "");

    // Kısıtlama kalkınca robots.txt yeniden okunur ve istek yapılır.
    robotsStatus = 200;
    const second = await politeFetch("https://throttled.test/products.json", "application/json");
    assert.equal(second.ok, true);
    assert.deepEqual(calls, ["/robots.txt", "/robots.txt", "/products.json"]);

    robotsStatus = 403;
    const blocked = await politeFetch("https://forbidden.test/products.json", "application/json");
    assert.ok(!blocked.ok && !blocked.retryable && /robots\.txt izin vermiyor/.test(blocked.reason));
  } finally {
    globalThis.fetch = real;
  }
});
