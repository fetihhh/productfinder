import { RSS_FEEDS } from "../config/sources.ts";
import { rssAdapter } from "./rss.ts";
import type { SourceAdapter } from "./types.ts";

export function enabledAdapters(): SourceAdapter[] {
  return RSS_FEEDS.filter((f) => f.enabled).map(rssAdapter);
}
