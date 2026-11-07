import { NextRequest, NextResponse } from "next/server";
import { inGhana } from "@/domain/navigation";
import { nearField } from "@/server/field-store";
import { rateLimit } from "@/server/rate-limit";
import { getSession } from "@/server/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, note: "Sign in to read shared roads." }, { status: 401 });
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inGhana({ lat, lng })) {
    return NextResponse.json({ ok: false, note: "This reading is set up for a point in Ghana." }, { status: 400 });
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!rateLimit(`field-near:${ip}`, 20, 60_000)) {
    return NextResponse.json({ ok: false, note: "Too many readings. Try again in a minute." }, { status: 429 });
  }
  const raining = req.nextUrl.searchParams.get("rain") === "yes";
  return NextResponse.json(nearField({ lat, lng }, session.mode === "demo" ? "demo" : "user", raining));
}
