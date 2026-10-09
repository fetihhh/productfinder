import { login } from "./actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const misconfigured = !process.env.APP_PASSWORD || !process.env.AUTH_SECRET;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form action={login} className="w-full max-w-xs space-y-3">
        <h1 className="text-lg font-semibold">Product Finder</h1>
        {misconfigured && (
          <p className="text-sm text-red-600">APP_PASSWORD ve AUTH_SECRET tanımlı değil (.env.local).</p>
        )}
        {error && <p className="text-sm text-red-600">Şifre hatalı.</p>}
        <input
          type="password"
          name="password"
          required
          autoFocus
          placeholder="Şifre"
          className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button className="w-full rounded bg-zinc-900 px-3 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">
          Giriş
        </button>
      </form>
    </main>
  );
}
