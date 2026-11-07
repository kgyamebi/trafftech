import { NextRequest, NextResponse } from "next/server";
import { mapProviderId } from "@/config/maps";
import { coordinatePlace, destinationAllowed, inGhana, parseCoordinateQuery, parseNominatim } from "@/domain/navigation";
import { rateLimit } from "@/server/rate-limit";
import { getSession } from "@/server/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "Sign in to use the map." }, { status: 401 });
  if (mapProviderId() === "off") {
    return NextResponse.json({ ok: false, code: "off", message: "Maps are not connected." }, { status: 503 });
  }
  const query = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (query.length < 2 || query.length > 80) {
    return NextResponse.json({ ok: false, code: "query", message: "Type a place name." }, { status: 400 });
  }
  const gate = destinationAllowed(query);
  if (!gate.ok) return NextResponse.json({ ok: false, code: "refused", message: gate.reason }, { status: 400 });
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!rateLimit(`maps-search:${ip}`, 1, 1100)) {
    return NextResponse.json({ ok: false, code: "rate", message: "Search is a little busy. Try again in a second." }, { status: 429 });
  }
  const typed = parseCoordinateQuery(query);
  if (typed) {
    if (!inGhana(typed)) {
      return NextResponse.json({ ok: false, code: "query", message: "Routing is set up for places in Ghana." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, places: [coordinatePlace(typed)], source: "user" });
  }
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("q", query);
    url.searchParams.set("countrycodes", "gh");
    url.searchParams.set("limit", "6");
    const response = await fetch(url, {
      headers: { "User-Agent": "Nokware/1.0 (Ghana driver navigation)", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("upstream");
    return NextResponse.json({ ok: true, places: parseNominatim(await response.json()) });
  } catch {
    return NextResponse.json({ ok: false, code: "down", message: "Search is temporarily unavailable." }, { status: 502 });
  }
}
