"use client";

import { useState } from "react";
import type { AdMedia } from "@/dtc/adMedia";

/**
 * Reklamın videosu/görseli: Meta'nın resmi önizleme sayfası sayfaya gömülemez (X-Frame-Options: deny), bu yüzden ekranın
 * sağında tek bir izleme penceresinde açılır; başka bir reklama basınca aynı pencere o reklama geçer.
 */
export function openViewer(id: string) {
  const w = 560;
  const h = Math.min(window.screen.availHeight - 40, 980);
  const left = Math.max(0, window.screen.availWidth - w - 16);
  const win = window.open(`/reklam/${id}`, "pf-reklam-izle", `popup,width=${w},height=${h},left=${left},top=16`);
  win?.focus();
}

/** Meta önizlemesini yan izleme penceresinde açan düğme (videosu sitede oynamayan reklamlar için). */
export function ViewerButton({ adId, primary = true, label = "▶ Videoyu izle" }: { adId: string; primary?: boolean; label?: string }) {
  return (
    <button type="button" className={`btn btn-sm ${primary ? "btn-primary" : ""}`} title="Reklamın videosunu/görselini yandaki izleme penceresinde açar" onClick={() => openViewer(adId)}>
      {label}
    </button>
  );
}

/**
 * Reklamın videosu sayfanın içinde: reklamla aynı metne sahip Instagram gönderisinin dosyası (resmi API). Dosya adresinin
 * süresi dolmuşsa (Instagram adresleri birkaç günde yenilenir) Instagram'ın resmi gömme oynatıcısına geçilir.
 */
export function AdPlayer({ m, className = "max-h-[70vh]" }: { m: AdMedia; className?: string }) {
  const [embed, setEmbed] = useState(!m.url);
  const embedUrl = m.permalink ? `${m.permalink.replace(/\/$/, "")}/embed/` : null;
  if (embed || !m.url) {
    return embedUrl ? (
      <iframe src={embedUrl} title="Reklamın Instagram gönderisi" loading="lazy" allowFullScreen scrolling="no" className="block h-[560px] w-full rounded-xl border-0 bg-white" />
    ) : null;
  }
  return m.video ? (
    <video src={m.url} poster={m.thumb ?? undefined} controls preload="metadata" playsInline onError={() => setEmbed(true)} className={`mx-auto aspect-[9/16] w-full rounded-xl bg-black object-contain ${className}`} />
  ) : (
    <img src={m.url} alt="Reklam görseli" loading="lazy" referrerPolicy="no-referrer" onError={() => setEmbed(true)} className={`w-full rounded-xl object-cover ${className}`} />
  );
}
