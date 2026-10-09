import { decodeEntities, stripTags } from "./html.ts";

export type FeedItem = {
  guid: string;
  title: string;
  link: string;
  pubDate: Date | null;
  categories: string[];
  contentHtml: string; // content:encoded, yoksa description
  /** content:encoded var mı (yazının tamamı beslemede mi)? */
  hasFullContent: boolean;
  comments: number;
};

function unwrapCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function tag(xml: string, name: string): string | null {
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i");
  const m = xml.match(re);
  return m ? unwrapCdata(m[1]).trim() : null;
}

function tags(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "gi");
  return [...xml.matchAll(re)].map((m) => unwrapCdata(m[1]).trim());
}

/** RSS 2.0 (WordPress) beslemesini ayrıştırır. */
export function parseRss(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = m[1];
    const link = decodeEntities(tag(block, "link") ?? "").trim();
    const title = stripTags(tag(block, "title") ?? "");
    if (!link || !title) continue;
    const date = tag(block, "pubDate");
    const parsed = date ? new Date(date) : null;
    const full = tag(block, "content:encoded");
    items.push({
      guid: decodeEntities(tag(block, "guid") ?? link),
      title,
      link,
      pubDate: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
      categories: tags(block, "category").map(stripTags).filter(Boolean),
      contentHtml: full ?? tag(block, "description") ?? "",
      hasFullContent: full !== null,
      comments: Number(tag(block, "slash:comments") ?? 0) || 0,
    });
  }
  return items;
}
