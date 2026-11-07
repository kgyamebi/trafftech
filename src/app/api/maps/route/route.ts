import { NextRequest, NextResponse } from "next/server";
import { mapProviderId } from "@/config/maps";
import { routeMemory } from "@/domain/living";
import { inGhana, parseOsrm, type GeoPoint, type TravelMode } from "@/domain/navigation";
import { rateLimit } from "@/server/rate-limit";
import { getSession } from "@/server/session";
import { readDatabase } from "@/server/store";

const PROFILES: Record<TravelMode, string> = { driving: "driving", walking: "foot", cycling: "bike" };

function point(value: string | null): GeoPoint | null {
  if (!value) return null;
  const [lat, lng] = value.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const next = { lat, lng };
  return inGhana(next) ? next : null;
}

export async function GET(req: NextRequest) {
  const signedIn = await getSession();
  if (!signedIn) return NextResponse.json({ ok: false, message: "Sign in to use the map." }, { status: 401 });
  if (mapProviderId() === "off") {
    return NextResponse.json({ ok: false, code: "off", message: "Maps are not connected." }, { status: 503 });
  }
  const from = point(req.nextUrl.searchParams.get("from"));
  const to = point(req.nextUrl.searchParams.get("to"));
  const via = point(req.nextUrl.searchParams.get("via"));
  const mode = req.nextUrl.searchParams.get("mode");
  if (!from || !to || (mode !== "driving" && mode !== "walking" && mode !== "cycling")) {
    return NextResponse.json({ ok: false, message: "Routing is set up for places in Ghana." }, { status: 400 });
  }
  const stops = via ? [from, via, to] : [from, to];
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!rateLimit(`maps-route:${ip}`, 4, 5_000)) {
    return NextResponse.json({ ok: false, message: "Routing is a little busy. Try again in a moment." }, { status: 429 });
  }
  try {
    const path = stops.map((stop) => `${stop.lng},${stop.lat}`).join(";");
    const radii = stops.map(() => "40").join(";");
    const base = `https://router.project-osrm.org/route/v1/${PROFILES[mode]}/${path}?overview=full&geometries=geojson&steps=true&alternatives=true`;
    const ask = async (tight: boolean) => {
      const response = await fetch(tight ? `${base}&radiuses=${radii}` : base, {
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
    const session = await getSession();
    let routes = parsed.routes;
    if (session?.mode === "user" && mode === "driving") {
      try {
        const db = readDatabase();
        const now = new Date();
        routes = parsed.routes.map((route) => {
          const memory = routeMemory(db.roadCells, db.fieldReports, route.geometry, now);
          return {
            ...route,
            ...(memory.memoryNote ? { memoryNote: memory.memoryNote } : {}),
            ...(memory.warnings.length ? { warnings: memory.warnings } : {}),
          };
        });
      } catch {
        routes = parsed.routes;
      }
    }
    return NextResponse.json({ ...parsed, routes });
  } catch {
    return NextResponse.json({ ok: false, message: "We couldn't calculate a route." }, { status: 502 });
  }
}
