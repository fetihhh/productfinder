import { test } from "node:test";
import assert from "node:assert/strict";
import { matchAdsToPosts } from "../dtc/adMedia.ts";

const post = (id: string, caption: string, media_type = "VIDEO") => ({ id, caption, media_type, media_url: `https://cdn/${id}.mp4`, thumb_url: null, permalink: `https://www.instagram.com/reel/${id}/` });

test("matchAdsToPosts: reklam metni gönderi açıklamasıyla örtüşürse gönderinin videosu; kısa ya da farklı metin eşleşmez", () => {
  const posts = [
    post("v1", "Finally, no more back pain! Our Posture Corrector Pro fixes your posture in 14 days 🔥 Shop now: https://x.com"),
    post("i1", "Finally no more back pain — posture corrector pro fixes your posture in 14 days", "IMAGE"),
    post("v2", "Le cadeau parfait pour les amoureux des étoiles. Livraison gratuite !"),
  ];
  const m = matchAdsToPosts(
    [
      { id: "a1", title: null, body: "Finally, no more back pain! Our Posture Corrector Pro fixes your posture in 14 days." },
      { id: "a2", title: null, body: "Le cadeau parfait pour les amoureux des etoiles — livraison gratuite partout en France." },
      { id: "a3", title: null, body: "Shop now 🔥" },
      { id: "a4", title: null, body: "Completely different text about kitchen knives and cutting boards for chefs" },
    ],
    posts,
  );
  assert.equal(m.get("a1")?.postId, "v1"); // eşitlikte video
  assert.equal(m.get("a1")?.video, true);
  assert.equal(m.get("a2")?.postId, "v2"); // aksan farkı yok sayılır
  assert.equal(m.has("a3"), false);
  assert.equal(m.has("a4"), false);
  assert.equal(matchAdsToPosts([{ id: "a1", title: null, body: "Finally, no more back pain! Our Posture Corrector Pro fixes" }], []).size, 0);
});
