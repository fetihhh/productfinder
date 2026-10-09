import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRss } from "../lib/rss.ts";
import { metaContent, unwrapRedirect, decodeEntities } from "../lib/html.ts";
import { normalizeName, productNameFromTitle } from "../lib/productName.ts";
import { pickBrand, sitewideDomains, summarizeLinks } from "../sources/rss.ts";

const FEED = `<?xml version="1.0"?><rss><channel>
<item>
  <title>BougeRV DuneRover Motorized Beach Wagon Offers Towing Assist &#038; More</title>
  <link>https://www.coolthings.com/bougerv-dunerover/</link>
  <pubDate>Thu, 08 Oct 2026 14:21:07 +0000</pubDate>
  <category><![CDATA[GEAR]]></category>
  <guid isPermaLink="false">https://www.coolthings.com/?p=114578</guid>
  <description><![CDATA[<p>Kısa özet</p>]]></description>
  <content:encoded><![CDATA[<p>Get it from <a href="https://www.bougerv.com/products/dunerover?ref=ct">BougeRV</a>.</p>]]></content:encoded>
  <slash:comments>3</slash:comments>
</item>
<item><title></title><link>https://x.com/a</link></item>
</channel></rss>`;

test("RSS ayrıştırma", () => {
  const items = parseRss(FEED);
  assert.equal(items.length, 1);
  const [it] = items;
  assert.equal(it.title, "BougeRV DuneRover Motorized Beach Wagon Offers Towing Assist & More");
  assert.equal(it.guid, "https://www.coolthings.com/?p=114578");
  assert.deepEqual(it.categories, ["GEAR"]);
  assert.equal(it.comments, 3);
  assert.equal(it.pubDate?.toISOString(), "2026-10-08T14:21:07.000Z");
  assert.match(it.contentHtml, /bougerv\.com/);
  assert.equal(it.hasFullContent, true);
  const excerptOnly = parseRss("<item><title>T</title><link>https://b.com/p</link><description>özet</description></item>");
  assert.equal(excerptOnly[0].hasFullContent, false);
});

test("Başlıktan ürün adı çıkarma", () => {
  assert.equal(productNameFromTitle("BougeRV DuneRover Motorized Beach Wagon Offers Towing Assist, Remote Operation"), "BougeRV DuneRover Motorized Beach Wagon");
  assert.equal(productNameFromTitle("Yashica Crew 6x review – a flip-screen camera"), "Yashica Crew 6x");
  assert.equal(productNameFromTitle("Review: Timex Pan Am Waterbury Automatic GMT"), "Timex Pan Am Waterbury Automatic GMT");
  assert.equal(productNameFromTitle("LEGO Technic Fast and Furious Dodge Charger R/T"), "LEGO Technic Fast and Furious Dodge Charger R/T");
  assert.equal(productNameFromTitle("eufy’s S4 video doorbell lets you look around the porch"), "eufy’s S4 video doorbell");
  assert.equal(productNameFromTitle("This Timex GMT Watch Is Built for Travel"), "Timex GMT Watch");
  assert.equal(productNameFromTitle("Logitech Yeti 2 Finally Updates the Iconic USB Mic"), "Logitech Yeti 2");
  assert.equal(normalizeName("Çanta  Pro—X 2.0!"), "canta pro x 2 0");
});

test("Affiliate linki istek atmadan çözülür; çözülemeyen olduğu gibi kalır", () => {
  assert.equal(
    unwrapRedirect("https://go.skimresources.com?id=1X2&xs=1&url=https%3A%2F%2Fwww.olight.com%2Fstore%2Farktac"),
    "https://www.olight.com/store/arktac",
  );
  assert.equal(unwrapRedirect("https://filson.sjv.io/c/1/2/3"), "https://filson.sjv.io/c/1/2/3");
  assert.equal(decodeEntities("A &amp; B &#8217; &#x41;"), "A & B ’ A");
});

test("og:image okunur (öznitelik sırası fark etmez)", () => {
  assert.equal(metaContent('<meta property="og:image" content="https://a.com/x.jpg">', "og:image"), "https://a.com/x.jpg");
  assert.equal(metaContent('<meta content="https://a.com/y.jpg" property="og:image" />', "og:image"), "https://a.com/y.jpg");
});

test("Linkler marka/pazaryeri olarak ayrılır, blogun kendi ve sosyal linkleri atılır", () => {
  const html = `
    <a href="https://www.olight.com/store/arktac">Buy</a>
    <a href="https://olight.com/">Olight</a>
    <a href="https://www.amazon.com/dp/B0X">Amazon</a>
    <a href="https://amzn.to/abc">Amazon kısa</a>
    <a href="https://www.coolthings.com/tag/edc">tag</a>
    <a href="https://www.youtube.com/watch?v=1">video</a>
    <a href="https://www.kickstarter.com/projects/x">KS</a>`;
  const s = summarizeLinks(html, "https://www.coolthings.com/post/", "coolthings.com");
  assert.deepEqual([...s.brands.keys()], ["olight.com"]);
  assert.deepEqual([...s.marketplaces.keys()], ["amazon.com", "amzn.to"]);
  const brand = pickBrand(s, new Set());
  assert.deepEqual(brand, { domain: "olight.com", url: "https://www.olight.com/store/arktac" });
});

test("Site geneli linkler (sponsor/menü) marka sayılmaz", () => {
  const post = (brand: string) =>
    summarizeLinks(`<a href="https://${brand}/p/1">x</a><a href="https://sponsor.com/">s</a>`, "https://blog.com/p", "blog.com");
  const summaries = [post("a.com"), post("b.com"), post("c.com"), post("d.com")];
  const ignore = sitewideDomains(summaries);
  assert.deepEqual([...ignore], ["sponsor.com"]);
  assert.equal(pickBrand(summaries[0], ignore)?.domain, "a.com");
  const onlySponsor = summarizeLinks(`<a href="https://sponsor.com/">s</a>`, "https://blog.com/p", "blog.com");
  assert.equal(pickBrand(onlySponsor, ignore), null);
});
