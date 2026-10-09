import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./auth.ts";

/** Server action'larda ikinci savunma hattı: proxy'ye ek olarak oturumu doğrular. */
export async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(token, process.env.AUTH_SECRET))) {
    throw new Error("Oturum geçersiz");
  }
}
