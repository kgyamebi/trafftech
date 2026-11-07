import { NextRequest, NextResponse } from "next/server";
import { mapProviderId } from "@/config/maps";
import { haversine, inGhana } from "@/domain/navigation";
import { parseMaxspeed } from "@/domain/road-limit";
import { rateLimit } from "@/server/rate-limit";
import { getSession } from "@/server/session";

const NONE = { kph: null, road: null, fresh: true };

export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json(NONE, { status: 401 });
  if (mapProviderId() === "off") return NextResponse.json(NONE);
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const point = { lat, lng };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inGhana(point)) return NextResponse.json(NONE);
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!rateLimit(`maps-limit:${ip}`, 1, 7_000)) return NextResponse.json({ kph: null, road: null, fresh: false });
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", lat.toFixed(6));
    url.searchParams.set("lon", lng.toFixed(6));
    url.searchParams.set("zoom", "17");
    url.searchParams.set("extratags", "1");
    const response = await fetch(url, {
      headers: { "User-Agent": "Nokware/1.0 (Ghana driver speed limit)", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ kph: null, road: null, fresh: false });
    const body = (await response.json()) as {
      category?: string;
      name?: string;
      lat?: string;
      lon?: string;
      extratags?: { maxspeed?: string };
    };
    const spot = { lat: Number(body.lat), lng: Number(body.lon) };
    const onRoad = body.category === "highway" && Number.isFinite(spot.lat) && Number.isFinite(spot.lng) && haversine(point, spot) <= 150;
    if (!onRoad) return NextResponse.json(NONE);
    const road = body.name?.trim().slice(0, 80) || null;
    return NextResponse.json({ kph: parseMaxspeed(body.extratags?.maxspeed), road, fresh: true });
  } catch {
    return NextResponse.json({ kph: null, road: null, fresh: false });
  }
}
