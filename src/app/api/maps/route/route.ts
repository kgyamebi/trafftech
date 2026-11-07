import { NextRequest, NextResponse } from "next/server";
import { mapProviderId } from "@/config/maps";
import { inGhana, parseOsrm, type GeoPoint, type TravelMode } from "@/domain/navigation";
import { rateLimit } from "@/server/rate-limit";

const PROFILES: Record<TravelMode, string> = { driving: "driving", walking: "foot", cycling: "bike" };

function point(value: string | null): GeoPoint | null {
  if (!value) return null;
  const [lat, lng] = value.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const next = { lat, lng };
  return inGhana(next) ? next : null;
}

export async function GET(req: NextRequest) {
  if (mapProviderId() === "off") {
    return NextResponse.json({ ok: false, code: "off", message: "Maps are not connected." }, { status: 503 });
  }
  const from = point(req.nextUrl.searchParams.get("from"));
  const to = point(req.nextUrl.searchParams.get("to"));
  const mode = req.nextUrl.searchParams.get("mode");
  if (!from || !to || (mode !== "driving" && mode !== "walking" && mode !== "cycling")) {
    return NextResponse.json({ ok: false, message: "Routing is set up for places in Ghana." }, { status: 400 });
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!rateLimit(`maps-route:${ip}`, 4, 5_000)) {
    return NextResponse.json({ ok: false, message: "Routing is a little busy. Try again in a moment." }, { status: 429 });
  }
  try {
    const base = `https://router.project-osrm.org/route/v1/${PROFILES[mode]}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true&alternatives=true`;
    const ask = async (tight: boolean) => {
      const response = await fetch(tight ? `${base}&radiuses=40;40` : base, {
        headers: { "User-Agent": "Nokware/1.0 (Ghana driver navigation)", Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("upstream");
      return parseOsrm(await response.json());
    };
    const tight = await ask(true);
    const parsed = tight.ok ? tight : await ask(false);
    if (!parsed.ok) return NextResponse.json(parsed, { status: 404 });
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ ok: false, message: "We couldn't calculate a route." }, { status: 502 });
  }
}
