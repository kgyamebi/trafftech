import { NextRequest, NextResponse } from "next/server";
import { mapProviderId } from "@/config/maps";
import { haversine, inGhana, parseNominatim } from "@/domain/navigation";
import { rateLimit } from "@/server/rate-limit";

const ALLOWED = new Set(["hospital", "pharmacy", "fuel station", "police", "school", "market", "bank", "restaurant"]);

export async function GET(req: NextRequest) {
  if (mapProviderId() === "off") {
    return NextResponse.json({ ok: false, message: "Maps are not connected." }, { status: 503 });
  }
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const query = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const point = { lat, lng };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inGhana(point) || !ALLOWED.has(query)) {
    return NextResponse.json({ ok: false, message: "Nearby search is set up for places in Ghana." }, { status: 400 });
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!rateLimit(`maps-nearby:${ip}`, 1, 1_100)) {
    return NextResponse.json({ ok: false, message: "Nearby search is a little busy. Try again in a second." }, { status: 429 });
  }
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("q", query);
    url.searchParams.set("countrycodes", "gh");
    url.searchParams.set("limit", "8");
    url.searchParams.set("bounded", "1");
    url.searchParams.set("viewbox", `${(lng - 0.02).toFixed(5)},${(lat + 0.02).toFixed(5)},${(lng + 0.02).toFixed(5)},${(lat - 0.02).toFixed(5)}`);
    const response = await fetch(url, {
      headers: { "User-Agent": "Nokware/1.0 (Ghana driver navigation)", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("upstream");
    const places = parseNominatim(await response.json())
      .map((place) => ({ ...place, distanceM: Math.round(haversine(point, place)) }))
      .filter((place) => place.distanceM <= 3_000)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 6);
    return NextResponse.json({ ok: true, places, source: "openstreetmap" });
  } catch {
    return NextResponse.json({ ok: false, message: "Nearby search is temporarily unavailable." }, { status: 502 });
  }
}
