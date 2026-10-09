// Bağımlılıksız, bilinçli olarak basit HTML/XML yardımcıları.

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", trade: "™", reg: "®", copy: "©",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return NAMED[code.toLowerCase()] ?? m;
  });
}

export function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

export type Link = { href: string; text: string };

/** <a href> linklerini mutlak URL olarak döndürür. */
export function extractLinks(html: string, baseUrl: string): Link[] {
  const links: Link[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const href = new URL(decodeEntities(m[2]).trim(), baseUrl).href;
      links.push({ href, text: stripTags(m[3]) });
    } catch {
      // geçersiz href: atla
    }
  }
  return links;
}

/**
 * Affiliate/yönlendirme linkini, hedef adres URL parametresinde açıkça yazıyorsa çözer.
 * Yönlendirmeye istek ATILMAZ (tıklama sayılmasın, robots ihlali olmasın).
 */
export function unwrapRedirect(href: string): string {
  let current = href;
  for (let depth = 0; depth < 3; depth++) {
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      return current;
    }
    let inner: string | null = null;
    for (const value of url.searchParams.values()) {
      if (/^https?:\/\//i.test(value)) {
        inner = value;
        break;
      }
    }
    if (!inner) return current;
    current = inner;
  }
  return current;
}

/** <meta property|name="key" content="..."> değeri. */
export function metaContent(html: string, key: string): string | null {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re1 = new RegExp(`<meta\\b[^>]*?(?:property|name)\\s*=\\s*["']${k}["'][^>]*?content\\s*=\\s*["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta\\b[^>]*?content\\s*=\\s*["']([^"']*)["'][^>]*?(?:property|name)\\s*=\\s*["']${k}["']`, "i");
  const m = html.match(re1) ?? html.match(re2);
  return m ? decodeEntities(m[1]).trim() : null;
}

/** WordPress yazı gövdesi: "entry-content" bloğundan itibaren; bulunamazsa <main>, o da yoksa boş. */
export function articleBody(html: string): string {
  const idx = html.search(/class\s*=\s*["'][^"']*\b(entry-content|post-content|article-content)\b/i);
  if (idx < 0) {
    // Tüm sayfayı okumak menü/sponsor linklerini marka sanmaya yol açar; emin değilsek hiç okuma.
    const main = html.match(/<main\b[\s\S]*?<\/main>/i);
    return main ? main[0] : "";
  }
  const end = html.slice(idx).search(/<(footer|aside)\b|id\s*=\s*["']comments["']|class\s*=\s*["'][^"']*\b(related-posts|sharedaddy|comments-area)\b/i);
  return end > 0 ? html.slice(idx, idx + end) : html.slice(idx, idx + 100_000);
}
