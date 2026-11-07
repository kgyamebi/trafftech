import { mapProviderId } from "@/config/maps";
import type { NavigationProvider, RoadIntelligenceProvider, SearchProvider, TrafficProvider } from "@/domain/services";
import type { RoadFact } from "@/domain/intelligence";
import {
  OPEN_PROVIDER_MODES,
  TRAFFIC_NOTE,
  type GeoPoint,
  type MapProvider,
  type PlaceHit,
  type RouteOption,
  type TravelMode,
} from "@/domain/navigation";

const searchCache = new Map<string, { at: number; places: PlaceHit[] }>();

export async function fetchPlaces(query: string): Promise<{ ok: true; places: PlaceHit[] } | { ok: false; code: string; message: string }> {
  if (mapProviderId() === "off") return { ok: false, code: "off", message: "Maps are not connected." };
  const key = query.trim().toLowerCase();
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < 60_000) return { ok: true, places: cached.places };
  try {
    const response = await fetch(`/api/maps/search?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(9000) });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; places?: PlaceHit[]; code?: string; message?: string } | null;
    if (!body?.ok) return { ok: false, code: body?.code ?? "down", message: body?.message ?? "Search is temporarily unavailable." };
    const places = body.places ?? [];
    searchCache.set(key, { at: Date.now(), places });
    return { ok: true, places };
  } catch {
    return { ok: false, code: "down", message: "Search is temporarily unavailable." };
  }
}

export async function fetchRoutes(
  from: GeoPoint,
  to: GeoPoint,
  mode: TravelMode,
  via?: GeoPoint | null,
): Promise<{ ok: true; routes: RouteOption[] } | { ok: false; message: string }> {
  if (mapProviderId() === "off") return { ok: false, message: "Maps are not connected." };
  try {
    const params = new URLSearchParams({ from: `${from.lat},${from.lng}`, to: `${to.lat},${to.lng}`, mode });
    if (via) params.set("via", `${via.lat},${via.lng}`);
    const response = await fetch(`/api/maps/route?${params}`, { signal: AbortSignal.timeout(12000) });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; routes?: RouteOption[]; message?: string } | null;
    if (!body?.ok || !body.routes?.length) return { ok: false, message: body?.message ?? "We couldn't calculate a route." };
    return { ok: true, routes: body.routes };
  } catch {
    return { ok: false, message: "We couldn't calculate a route." };
  }
}

export async function reverseLabel(point: GeoPoint): Promise<string | null> {
  try {
    const response = await fetch(`/api/maps/reverse?lat=${point.lat}&lng=${point.lng}`, { signal: AbortSignal.timeout(8000) });
    const body = (await response.json()) as { label?: string | null };
    return body.label ?? null;
  } catch {
    return null;
  }
}

export function createOpenMapProvider(): MapProvider {
  let alive = true;
  return {
    id: "open",
    label: "OpenStreetMap",
    modes: OPEN_PROVIDER_MODES,
    async initialize() {
      return alive ? { ok: true, message: "OpenStreetMap" } : { ok: false, message: "Disposed." };
    },
    async searchPlaces(query) {
      const result = await fetchPlaces(query);
      if (!result.ok) throw new Error(result.message);
      return result.places;
    },
    async geocode(query) {
      const places = await this.searchPlaces(query);
      return places[0] ?? null;
    },
    async reverseGeocode(point) {
      return reverseLabel(point);
    },
    async calculateRoute(from: GeoPoint, to: GeoPoint, mode: TravelMode, via?: GeoPoint | null) {
      const result = await fetchRoutes(from, to, mode, via);
      if (!result.ok) throw new Error(result.message);
      return result.routes;
    },
    getRouteAlternatives(from, to, mode) {
      return this.calculateRoute(from, to, mode);
    },
    async getCurrentLocation() {
      return { available: false as const, note: "This provider does not supply a device location." };
    },
    startNavigation() {},
    stopNavigation() {},
    async updateTraffic() {
      return { available: false as const, note: TRAFFIC_NOTE };
    },
    dispose() {
      alive = false;
    },
  };
}

export class OpenSearchProvider implements SearchProvider {
  readonly id = "open";
  readonly sourceLabel = "OpenStreetMap";
  async searchPlaces(query: string) {
    const result = await fetchPlaces(query);
    return result.ok ? result : { ok: false as const, message: result.message };
  }
}

export class OpenNavigationProvider implements NavigationProvider {
  readonly id = "open";
  readonly sourceLabel = "OpenStreetMap";
  readonly lanes = false;
  readonly predictiveTrafficReroute = false;
  calculateRoute(from: GeoPoint, to: GeoPoint, mode: TravelMode, via?: GeoPoint | null) {
    return fetchRoutes(from, to, mode, via);
  }
}

export class OpenTrafficProvider implements TrafficProvider {
  readonly id = "open";
  readonly live = false as const;
  describe() {
    return { sourceLabel: "OpenStreetMap", note: TRAFFIC_NOTE, updatedAt: null };
  }
}

export class OpenRoadIntelligence implements RoadIntelligenceProvider {
  readonly id = "open";
  readonly sourceLabel = "OpenStreetMap";
  lookup(_at: string): RoadFact[] {
    return [];
  }
}

export function createOpenServices() {
  return {
    search: new OpenSearchProvider(),
    navigation: new OpenNavigationProvider(),
    traffic: new OpenTrafficProvider(),
    road: new OpenRoadIntelligence(),
  };
}
