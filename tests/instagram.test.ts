import { test } from "node:test";
import assert from "node:assert/strict";
import { discoveryUrl, instagramClient, instagramHandle, rankPosts } from "../dtc/instagram.ts";

test("instagramHandle: ana sayfadaki en sık hesap; gönderi/reels/paylaş bağlantıları ve sayılar atlanır", () => {
  const html = `
    <a href="https://www.instagram.com/p/Cxyz123/">post</a>
    <a href="https://instagram.com/reel/abc">reel</a>
    <a href="https://www.instagram.com/Get.Cosmora/" class="social">IG</a>
    <a href="https://www.instagram.com/get.cosmora?igsh=1">IG</a>
    <a href="https://www.instagram.com/themefullstack">x</a>
    <a href="https://www.instagram.com/themefullstack">x</a>
    <a href="https://www.instagram.com/themefullstack">x</a>
    <a href="https://www.instagram.com/12345">x</a>`;
  assert.equal(instagramHandle(html), "get.cosmora");
  assert.equal(instagramHandle('<a href="https://www.instagram.com/explore/tags/x">'), null);
  assert.equal(instagramHandle('{"instagram":"https:\\/\\/instagram.com\\/brasapro"}'), "brasapro");
  assert.equal(instagramHandle(null), null);
  assert.equal(instagramHandle('<a href="https://instagram.com/shopify">'), null); // temanın varsayılan bağlantısı
});

test("rankPosts: etkileşim = beğeni + 3 × yorum; ortancaya göre kaç kat", () => {
  const { posts, medianEngagement } = rankPosts([
    { id: "1", like_count: 100, comments_count: 0 },
    { id: "2", like_count: 90, comments_count: 10 },
    { id: "3", like_count: 2000, comments_count: 100 },
    { id: "4", comments_count: 5 }, // beğeni gizli
  ]);
  assert.equal(medianEngagement, 110);
  assert.deepEqual(
    posts.map((p) => [p.id, p.engagement, p.outlier]),
    [
      ["3", 2300, 20.9],
      ["2", 120, 1.1],
      ["1", 100, 0.9],
      ["4", 15, 0.1],
    ],
  );
  assert.deepEqual(rankPosts([]).posts, []);
});

test("discoveryUrl: Business Discovery alanları, kullanıcı adı ve sınır", () => {
  const u = decodeURIComponent(discoveryUrl("1784", "get.cosmora", "v24.0", 30));
  assert.ok(u.startsWith("https://graph.facebook.com/v24.0/1784?fields=business_discovery.username(get.cosmora){"));
  assert.ok(u.includes("media.limit(30){id,caption,like_count,comments_count,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp}"));
});

test("instagramClient: kişisel hesap yalnızca o hesabı atlar, izin hatası adımı durdurur", async () => {
  const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const personal = instagramClient("t", "v24.0", reply(400, { error: { code: 110, message: "Invalid user id" } }));
  assert.deepEqual(await personal.discover("1", "someone"), { ok: false, fatal: false, reason: "Hesap profesyonel değil ya da bulunamadı: Invalid user id" });
  const noPerm = instagramClient("t", "v24.0", reply(403, { error: { code: 10, message: "Permission denied" } }));
  const r = await noPerm.ownAccountId();
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.fatal, true);
  const own = instagramClient("t", "v24.0", reply(200, { data: [{ id: "p1" }, { id: "p2", instagram_business_account: { id: "1784", username: "me" } }] }));
  assert.deepEqual(await own.ownAccountId(), { ok: true, data: { id: "1784", username: "me" } });
  const found = instagramClient("t", "v24.0", reply(200, { business_discovery: { id: "9", username: "brasapro", media: { data: [{ id: "5" }] } } }));
  const d = await found.discover("1784", "brasapro");
  assert.equal(d.ok && d.data.media?.data?.[0].id, "5");
});
