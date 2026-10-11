"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";

const ITEMS = [
  { href: "/ozet", label: "Özet", match: (p: string) => p === "/ozet" },
  { href: "/", label: "Ürünler", match: (p: string) => p === "/" || p.startsWith("/p/") },
  { href: "/yeni", label: "Yeni mağazalar", match: (p: string) => p === "/yeni" || p.startsWith("/m/") },
  { href: "/reklamlar", label: "Reklamlar", match: (p: string) => p === "/reklamlar" },
  { href: "/turkiye", label: "Türkiye", match: (p: string) => p === "/turkiye" },
  { href: "/nisler", label: "Nişler", match: (p: string) => p === "/nisler" },
  { href: "/?sort=rising", label: "Yükselenler", match: () => false },
  { href: "/siteler", label: "Siteler", match: (p: string) => p === "/siteler" },
];

function Logo() {
  return (
    <Link href="/ozet" className="flex shrink-0 items-center gap-2.5" aria-label="Product Finder">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-linear-to-br from-amber-400 to-orange-600 shadow-[0_4px_12px_-4px_rgb(234_88_12/0.7)]">
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="m15 15 5 5" />
          <path d="m8 11 2 2 3.5-4" />
        </svg>
      </span>
      <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">
        Product<span className="text-brand-strong">Finder</span>
      </span>
    </Link>
  );
}

/** Tüm sayfalarda ortak üst menü (giriş sayfasında gösterilmez). */
export function TopNav() {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Logo />
        <nav className="no-scrollbar -mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1">
          {ITEMS.map((i) => {
            const active = i.match(path);
            return (
              <Link
                key={i.href}
                href={i.href}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  active ? "bg-foreground text-background shadow-sm" : "text-muted hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                {i.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-1.5">
          <a href="/export" className="btn btn-sm hidden md:inline-flex" title="Favori ve incelenecek ürünler: fiyat, toptancı, marj (Excel)">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            CSV
          </a>
          <form action={logout}>
            <button className="btn btn-sm" title="Çıkış">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
              </svg>
              <span className="hidden sm:inline">Çıkış</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
