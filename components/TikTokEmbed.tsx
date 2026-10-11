"use client";

import { useEffect, useRef } from "react";

/**
 * TikTok'un resmi profil gömmesi (oEmbed "creator" biçimi): hesabın son videoları sayfada oynatılır. Gömme betiği
 * kullanıcının tarayıcısında çalışır; sunucu TikTok'u okumaz. Sayfa değişince betik yeniden yüklenip gömme yenilenir.
 */
export function TikTokEmbed({ handle }: { handle: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.innerHTML = "";
    const q = document.createElement("blockquote");
    q.className = "tiktok-embed";
    q.setAttribute("cite", `https://www.tiktok.com/@${handle}`);
    q.setAttribute("data-unique-id", handle);
    q.setAttribute("data-embed-from", "oembed");
    q.setAttribute("data-embed-type", "creator");
    q.style.maxWidth = "780px";
    q.style.minWidth = "288px";
    const section = document.createElement("section");
    const a = document.createElement("a");
    a.href = `https://www.tiktok.com/@${handle}?refer=creator_embed`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = `@${handle}`;
    section.appendChild(a);
    q.appendChild(section);
    el.appendChild(q);
    const s = document.createElement("script");
    s.src = "https://www.tiktok.com/embed.js";
    s.async = true;
    el.appendChild(s);
  }, [handle]);
  return <div ref={box} className="min-h-[200px]" />;
}
