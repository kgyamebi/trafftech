import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import fs from "fs";
import path from "path";
import { dataDir } from "./store";

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

function secret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, ".secret");
  if (!fs.existsSync(file)) fs.writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  return fs.readFileSync(file, "utf8");
}

export interface SessionPayload {
  mode: "user" | "demo";
  uid?: string;
  exp: number;
}

export function signSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readSessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    if (payload.mode !== "user" && payload.mode !== "demo") return null;
    return payload;
  } catch {
    return null;
  }
}
