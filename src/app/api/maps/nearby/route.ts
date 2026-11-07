import { NextRequest, NextResponse } from "next/server";
import { mapProviderId } from "@/config/maps";
import { nearbyAllowed, placesForQuery } from "@/domain/catalogue";
import { fieldFromDatabase, fuelPriceNote, publicPlaces } from "@/domain/field";
import { haversine, inGhana, parseNominatim, type PlaceHit } from "@/domain/navigation";
import { rateLimit } from "@/server/rate-limit";
import { getSession } from "@/server/session";
import { readDatabase } from "@/server/store";

export async function GET(req: NextRequest) {
  const signedIn = await getSession();
  if (!signedIn) return NextResponse.json({ ok: false, message: "Sign in to use the map." }, { status: 401 });
  if (mapProviderId() === "off") {
    return NextResponse.json({ ok: false, message: "Maps are not connected." }, { status: 503 });
  }
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const query = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const point = { lat, lng };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inGhana(point) || !nearbyAllowed(query)) {
    return NextResponse.json({ ok: false, message: "Nearby search is set up for places in Ghana." }, { status: 400 });
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!rateLimit(`maps-nearby:${ip}`, 1, 1_100)) {
    return NextResponse.json({ ok: false, message: "Nearby search is a little busy. Try again in a second." }, { status: 429 });
  }
  const session = await getSession();
  let known: PlaceHit[] = [];
  let prices: ReturnType<typeof fieldFromDatabase>["reports"] = [];
  if (session?.mode === "user") {
    try {
      const state = fieldFromDatabase(readDatabase());
      known = placesForQuery(publicPlaces(state, "gh", point, 3_000), query, point).map((place) => ({
        id: place.id,
        name: place.name,
        address: place.note || `${place.label}. Confirmed by drivers`,
        lat: place.lat,
        lng: place.lng,
        source: "USER_PROVIDED" as const,
        phone: place.phone || null,
        hours: place.hours || null,
      }));
      prices = state.reports;
    } catch {
      known = [];
    }
  }
  let mapped: PlaceHit[] = [];
  let mappedError = "";
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
    mapped = parseNominatim(await response.json())
      .map((place) => ({ ...place, distanceM: Math.round(haversine(point, place)), source: "openstreetmap" as const }))
      .filter((place) => place.distanceM <= 3_000)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 6);
  } catch {
    mappedError = "Nearby search is temporarily unavailable.";
  }
  const seen = new Set(known.map((place) => `${place.lat.toFixed(3)},${place.lng.toFixed(3)}`));
  const places = [...known, ...mapped.filter((place) => !seen.has(`${place.lat.toFixed(3)},${place.lng.toFixed(3)}`))].slice(0, 8);
  if (query === "fuel station") {
    const now = new Date();
    for (const place of places) {
      place.priceNote = fuelPriceNote(prices, place, now);
    }
  }
  if (!places.length && mappedError) {
    return NextResponse.json({ ok: false, message: mappedError }, { status: 502 });
  }
  return NextResponse.json({ ok: true, places, source: known.length && !mapped.length ? "USER_PROVIDED" : "openstreetmap" });
}
