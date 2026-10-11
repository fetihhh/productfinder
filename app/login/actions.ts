"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  passwordMatches,
} from "@/lib/auth";
import { attemptKey, clearFailures, isLocked, recordFailure } from "@/lib/loginGuard";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.APP_PASSWORD ?? "";
  const secret = process.env.AUTH_SECRET ?? "";

  const h = await headers();
  const key = await attemptKey(h.get("x-forwarded-for"), h.get("x-real-ip"), secret);
  // Kilitliyken doğru şifre de kabul edilmez (deneme sayısı bilgisi sızmasın).
  if (await isLocked(key)) {
    await new Promise((r) => setTimeout(r, 1000));
    redirect("/login?error=locked");
  }
  if (!(await passwordMatches(password, expected, secret))) {
    await recordFailure(key);
    await new Promise((r) => setTimeout(r, 1000)); // kaba kuvvet denemelerini yavaşlat
    redirect("/login?error=1");
  }
  await clearFailures(key);

  (await cookies()).set(SESSION_COOKIE, await createSessionToken(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
