import { NextRequest, NextResponse } from "next/server";
import { mapProviderId } from "@/config/maps";
import { inGhana, readReverse } from "@/domain/navigation";
import { parseMaxspeed } from "@/domain/road-limit";
import { rateLimit } from "@/server/rate-limit";

export async function GET(req: NextRequest) {
  if (mapProviderId() === "off") return NextResponse.json({ label: null, place: null });
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const tapped = { lat, lng };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inGhana(tapped)) return NextResponse.json({ label: null, place: null });
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!rateLimit(`maps-reverse:${ip}`, 1, 1_100)) return NextResponse.json({ label: null, place: null, busy: true });
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("extratags", "1");
    const response = await fetch(url, {
      headers: { "User-Agent": "Nokware/1.0 (Ghana driver navigation)", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ label: null, place: null });
    const read = readReverse(await response.json(), tapped);
    const { maxspeed, ...rest } = read;
    const place = { ...rest, limitKph: parseMaxspeed(maxspeed) };
    return NextResponse.json({ label: place.name === "Dropped pin" ? null : place.name, place });
  } catch {
    return NextResponse.json({ label: null, place: null });
  }
}
