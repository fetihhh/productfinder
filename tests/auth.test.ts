import { test } from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, passwordMatches, verifySessionToken, SESSION_MAX_AGE_SECONDS } from "../lib/auth.ts";

const SECRET = "test-secret";

test("Doğru şifre eşleşir, yanlış ve boş şifre eşleşmez", async () => {
  assert.equal(await passwordMatches("abc", "abc", SECRET), true);
  assert.equal(await passwordMatches("abd", "abc", SECRET), false);
  assert.equal(await passwordMatches("", "", SECRET), false);
  assert.equal(await passwordMatches("abc", "abc", ""), false);
});

test("Geçerli token doğrulanır", async () => {
  const token = await createSessionToken(SECRET);
  assert.equal(await verifySessionToken(token, SECRET), true);
});

test("Başka secret ile, değiştirilmiş veya süresi dolmuş token reddedilir", async () => {
  const now = Date.now();
  const token = await createSessionToken(SECRET, now);
  assert.equal(await verifySessionToken(token, "other"), false);

  const [exp, sig] = token.split(".");
  assert.equal(await verifySessionToken(`${Number(exp) + 1000}.${sig}`, SECRET), false);

  const later = now + (SESSION_MAX_AGE_SECONDS + 1) * 1000;
  assert.equal(await verifySessionToken(token, SECRET, later), false);

  assert.equal(await verifySessionToken(undefined, SECRET), false);
  assert.equal(await verifySessionToken("garbage", SECRET), false);
});
