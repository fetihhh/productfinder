import { login } from "./actions";

export const metadata = { title: "Giriş" };

const FEATURES = [
  ["Yeni mağazalar", "Her gün binlerce yeni alan adından açılan Shopify mağazaları"],
  ["Winner sinyalleri", "Stok hareketi, rakip mağazalar, reklam ve toptancı satışı"],
  ["Toptancı ve kâr", "Aynı ürünün toptan fiyatı ve adet başı net kâr"],
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const misconfigured = !process.env.APP_PASSWORD || !process.env.AUTH_SECRET;

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-linear-to-br from-amber-300/40 via-orange-400/25 to-transparent blur-3xl dark:from-amber-500/20 dark:via-orange-600/10" />
      <div className="relative grid w-full max-w-4xl items-center gap-10 md:grid-cols-[1.1fr_1fr]">
        <section className="hidden md:block">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-linear-to-br from-amber-400 to-orange-600 shadow-[0_8px_24px_-8px_rgb(234_88_12/0.7)]">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10.5" cy="10.5" r="6" />
              <path d="m15 15 5 5" />
              <path d="m8 11 2 2 3.5-4" />
            </svg>
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight">
            Winner ürünü <span className="bg-linear-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">ilk sen bul.</span>
          </h1>
          <p className="mt-3 max-w-md text-muted">Son 5 ayda açılmış küçük mağazaların sattığı ürünler, toptancıları ve kâr hesabı tek yerde.</p>
          <ul className="mt-8 space-y-4">
            {FEATURES.map(([title, text]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 5 5 9-10" />
                  </svg>
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-sm text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <form action={login} className="card mx-auto w-full max-w-sm p-7 sm:p-8">
          <p className="eyebrow" lang="en">Product Finder</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Tekrar hoş geldin</h2>
          <p className="mt-1 text-sm text-muted">Devam etmek için şifreni gir.</p>
          {misconfigured && (
            <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">APP_PASSWORD ve AUTH_SECRET tanımlı değil (.env.local).</p>
          )}
          {error && (
            <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {error === "locked" ? "Çok fazla hatalı deneme: giriş geçici olarak kilitlendi. 15 dakika sonra tekrar deneyin." : "Şifre hatalı, tekrar dene."}
            </p>
          )}
          <label className="label mt-6" htmlFor="password">
            Şifre
          </label>
          <input id="password" type="password" name="password" required autoFocus placeholder="••••••••" className="field" />
          <button className="btn-primary mt-4 w-full py-2.5">Giriş yap</button>
        </form>
      </div>
    </main>
  );
}
