import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowed, parseRobots } from "../lib/robots.ts";

const TXT = `
# yorum
User-agent: Googlebot
Disallow: /

User-agent: *
Disallow: /search
Disallow: /r/*
Allow: /r/p/*
Disallow: /*?*comment=*
Disallow: /login$
`;

test("Yıldız grubu uygulanır, başka botun grubu uygulanmaz", () => {
  const rules = parseRobots(TXT, "ProductFinderBot");
  assert.equal(isAllowed(rules, "/"), true);
  assert.equal(isAllowed(rules, "/products/x"), true);
  assert.equal(isAllowed(rules, "/search?q=1"), false);
});

test("En uzun eşleşme kazanır, Allow istisnası çalışır", () => {
  const rules = parseRobots(TXT, "ProductFinderBot");
  assert.equal(isAllowed(rules, "/r/abc"), false);
  assert.equal(isAllowed(rules, "/r/p/123"), true);
});

test("* ve $ desenleri", () => {
  const rules = parseRobots(TXT, "ProductFinderBot");
  assert.equal(isAllowed(rules, "/post?x=1&comment=2"), false);
  assert.equal(isAllowed(rules, "/login"), false);
  assert.equal(isAllowed(rules, "/login/help"), true);
});

test("Bize özel grup varsa yıldız grubu yerine o kullanılır", () => {
  const rules = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: productfinderbot\nDisallow: /private\n", "ProductFinderBot");
  assert.equal(isAllowed(rules, "/"), true);
  assert.equal(isAllowed(rules, "/private/x"), false);
});

test("Reddit tarzı tam yasak", () => {
  const rules = parseRobots("User-agent: *\nDisallow: /\n", "ProductFinderBot");
  assert.equal(isAllowed(rules, "/r/BuyItForLife/top/.rss"), false);
});

test("Boş Disallow her şeye izin verir", () => {
  const rules = parseRobots("User-agent: *\nDisallow:\n", "ProductFinderBot");
  assert.equal(isAllowed(rules, "/anything"), true);
});
