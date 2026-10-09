// Site trafiği işareti: Tranco top-1M listesi (https://tranco-list.eu, ücretsiz, anahtar gerekmez).
// Liste; Chrome UX Report, Cloudflare Radar, Umbrella, Majestic ve Farsight sıralamalarının 30 günlük ortalamasıdır.
// robots.txt /api ve /list/ yollarını yasaklar; yalnızca izin verilen günlük zip indirmesi kullanılır.
import { inflateRawSync } from "node:zlib";

export const TRANCO_URL = "https://tranco-list.eu/top-1m.csv.zip";
export const TRANCO_MAX_BYTES = 30_000_000;

export type ZipEntry = { name: string; date: string | null; data: Buffer };

/** Tek dosyalık bir zip'in ilk girdisini açar (yalnızca "stored" ve "deflate" yöntemleri). */
export function unzipFirst(bytes: Uint8Array): ZipEntry {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Merkezi dizin sonu kaydı (EOCD) dosyanın son ~64 KB'ında.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip: merkezi dizin bulunamadı");
  const cd = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error("zip: geçersiz merkezi dizin");
  const method = buf.readUInt16LE(cd + 10);
  const dosDate = buf.readUInt16LE(cd + 14);
  const compressedSize = buf.readUInt32LE(cd + 20);
  const nameLen = buf.readUInt16LE(cd + 28);
  const localOffset = buf.readUInt32LE(cd + 42);
  const name = buf.toString("utf8", cd + 46, cd + 46 + nameLen);

  if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("zip: geçersiz yerel başlık");
  const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
  const raw = buf.subarray(start, start + compressedSize);
  const data = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : null;
  if (!data) throw new Error(`zip: desteklenmeyen sıkıştırma yöntemi ${method}`);

  const y = 1980 + (dosDate >> 9);
  const m = (dosDate >> 5) & 0x0f;
  const d = dosDate & 0x1f;
  const date = m >= 1 && m <= 12 && d >= 1 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
  return { name, date, data };
}

/** "rank,domain" satırlarından yalnızca istenen alan adlarının sırasını çıkarır. */
export function ranksFor(csv: string, domains: Iterable<string>): Map<string, number> {
  const wanted = new Set([...domains].map((d) => d.toLowerCase()));
  const out = new Map<string, number>();
  let pos = 0;
  while (pos < csv.length && out.size < wanted.size) {
    let end = csv.indexOf("\n", pos);
    if (end < 0) end = csv.length;
    const comma = csv.indexOf(",", pos);
    if (comma > pos && comma < end) {
      const domain = csv.slice(comma + 1, end).trim().toLowerCase();
      if (wanted.has(domain) && !out.has(domain)) out.set(domain, Number(csv.slice(pos, comma)));
    }
    pos = end + 1;
  }
  return out;
}
