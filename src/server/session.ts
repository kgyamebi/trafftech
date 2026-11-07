import "server-only";
import { cookies } from "next/headers";
import { readSessionToken, signSession, type SessionPayload } from "./crypto";

export const COOKIE = "nokware_session";

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(COOKIE)?.value);
}

export async function setSession(payload: Omit<SessionPayload, "exp">) {
  const token = signSession({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}
