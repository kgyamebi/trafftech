import type { GeoPoint, PlaceHit, RouteOption, TravelMode } from "./navigation";
import type { RoadFact } from "./intelligence";

export interface SearchProvider {
  readonly id: string;
  readonly sourceLabel: string;
  searchPlaces(query: string): Promise<{ ok: true; places: PlaceHit[] } | { ok: false; message: string }>;
}

export interface NavigationProvider {
  readonly id: string;
  readonly sourceLabel: string;
  readonly lanes: boolean;
  readonly predictiveTrafficReroute: boolean;
  calculateRoute(from: GeoPoint, to: GeoPoint, mode: TravelMode): Promise<{ ok: true; routes: RouteOption[] } | { ok: false; message: string }>;
}

export interface TrafficProvider {
  readonly id: string;
  readonly live: false;
  describe(): { sourceLabel: string; note: string; updatedAt: null };
}

export interface RoadIntelligenceProvider {
  readonly id: string;
  readonly sourceLabel: string;
  lookup(at: string): RoadFact[];
}

export interface MapSurface {
  readonly id: string;
  readonly sourceLabel: string;
  readonly render: boolean;
  readonly night: boolean;
  readonly tilt: boolean;
  readonly offline: boolean;
}

const NOT_CONNECTED = "Not connected. Driver OS will not invent this feed.";

export class UnavailableSearch implements SearchProvider {
  readonly sourceLabel = "Not connected";
  constructor(readonly id: string, private readonly label: string) {}
  async searchPlaces(_query: string): Promise<{ ok: false; message: string }> {
    return { ok: false, message: `${this.label} is not connected.` };
  }
}

export class UnavailableNavigation implements NavigationProvider {
  readonly sourceLabel = "Not connected";
  readonly lanes = false;
  readonly predictiveTrafficReroute = false;
  constructor(readonly id: string, private readonly label: string) {}
  async calculateRoute(_from: GeoPoint, _to: GeoPoint, _mode: TravelMode): Promise<{ ok: false; message: string }> {
    return { ok: false, message: `${this.label} is not connected.` };
  }
}

export class UnavailableTraffic implements TrafficProvider {
  readonly live = false as const;
  constructor(readonly id: string, private readonly label: string) {}
  describe() {
    return { sourceLabel: "Not connected" as const, note: `${this.label} is not connected. ${NOT_CONNECTED}`, updatedAt: null };
  }
}

export class UnavailableRoadIntelligence implements RoadIntelligenceProvider {
  readonly sourceLabel = "Not connected";
  constructor(readonly id: string) {}
  lookup(_at: string): RoadFact[] {
    return [];
  }
}

export class UnavailableMap implements MapSurface {
  readonly sourceLabel = "Not connected";
  readonly render = false;
  readonly night = false;
  readonly tilt = false;
  readonly offline = false;
  constructor(readonly id: string) {}
}

export class MapboxProvider {
  readonly id = "mapbox";
  readonly search = new UnavailableSearch("mapbox", "Mapbox");
  readonly navigation = new UnavailableNavigation("mapbox", "Mapbox");
  readonly traffic = new UnavailableTraffic("mapbox", "Mapbox");
  readonly road = new UnavailableRoadIntelligence("mapbox");
  readonly map = new UnavailableMap("mapbox");
}

export class TomTomProvider {
  readonly id = "tomtom";
  readonly search = new UnavailableSearch("tomtom", "TomTom");
  readonly navigation = new UnavailableNavigation("tomtom", "TomTom");
  readonly traffic = new UnavailableTraffic("tomtom", "TomTom");
  readonly road = new UnavailableRoadIntelligence("tomtom");
  readonly map = new UnavailableMap("tomtom");
}

export class GoogleProvider {
  readonly id = "google";
  readonly search = new UnavailableSearch("google", "Google");
  readonly navigation = new UnavailableNavigation("google", "Google");
  readonly traffic = new UnavailableTraffic("google", "Google");
  readonly road = new UnavailableRoadIntelligence("google");
  readonly map = new UnavailableMap("google");
}

export class DemoRoadIntelligence implements RoadIntelligenceProvider {
  readonly id = "demo";
  readonly sourceLabel = "DEMO";
  lookup(_at: string): RoadFact[] {
    return [];
  }
}

export class DemoTraffic implements TrafficProvider {
  readonly id = "demo";
  readonly live = false as const;
  describe() {
    return {
      sourceLabel: "DEMO",
      note: "Demonstration congestion is scripted. It is not live traffic.",
      updatedAt: null,
    };
  }
}
