export type VendorId = "open" | "demo" | "mapbox" | "tomtom" | "google";

export interface ProviderCapabilities {
  id: VendorId;
  label: string;
  configured: boolean;
  sourceLabel: string;
  map: { render: boolean; night: boolean; tilt: boolean; offline: boolean };
  search: { places: boolean };
  navigation: {
    routes: boolean;
    alternatives: boolean;
    lanes: boolean;
    voiceFromProvider: boolean;
    predictiveTrafficReroute: boolean;
  };
  traffic: { live: boolean; note: string };
  speedLimits: { verified: boolean; note: string };
  road: { live: boolean; note: string };
}

const NONE = "Not connected. Driver OS will not invent this feed.";

function empty(id: VendorId, label: string): ProviderCapabilities {
  return {
    id,
    label,
    configured: false,
    sourceLabel: "Not connected",
    map: { render: false, night: false, tilt: false, offline: false },
    search: { places: false },
    navigation: { routes: false, alternatives: false, lanes: false, voiceFromProvider: false, predictiveTrafficReroute: false },
    traffic: { live: false, note: NONE },
    speedLimits: { verified: false, note: "Speed limit information unavailable" },
    road: { live: false, note: "No road-intelligence feed is connected." },
  };
}

export function openCapabilities(enabled = true): ProviderCapabilities {
  if (!enabled) {
    const off = empty("open", "OpenStreetMap");
    off.sourceLabel = "Not connected";
    off.traffic.note = "Maps are not connected in this build.";
    return off;
  }
  return {
    id: "open",
    label: "OpenStreetMap",
    configured: true,
    sourceLabel: "OpenStreetMap",
    map: { render: true, night: true, tilt: false, offline: false },
    search: { places: true },
    navigation: {
      routes: true,
      alternatives: true,
      lanes: false,
      voiceFromProvider: false,
      predictiveTrafficReroute: false,
    },
    traffic: { live: false, note: "Traffic is not available from this provider. Routes are ordered by estimated time." },
    speedLimits: { verified: false, note: "This provider does not supply a verified speed limit." },
    road: { live: false, note: "No road-intelligence feed is connected." },
  };
}

export function demoCapabilities(): ProviderCapabilities {
  return {
    id: "demo",
    label: "Demonstration",
    configured: true,
    sourceLabel: "DEMO",
    map: { render: true, night: true, tilt: false, offline: true },
    search: { places: false },
    navigation: {
      routes: true,
      alternatives: true,
      lanes: false,
      voiceFromProvider: false,
      predictiveTrafficReroute: false,
    },
    traffic: { live: false, note: "Demonstration congestion is scripted. It is not live traffic." },
    speedLimits: { verified: false, note: "The demonstration limit is scripted. It is not a verified posting." },
    road: { live: false, note: "Road notes in the demonstration are scripted." },
  };
}

export function vendorCapabilities(id: "mapbox" | "tomtom" | "google", token: string | undefined): ProviderCapabilities {
  const label = id === "mapbox" ? "Mapbox" : id === "tomtom" ? "TomTom" : "Google";
  const row = empty(id, label);
  if (!token?.trim()) return row;
  return {
    ...row,
    configured: false,
    sourceLabel: "Not connected",
    traffic: { live: false, note: `${label} is named in the configuration, and this build does not call it yet.` },
    speedLimits: { verified: false, note: `${label} is not queried for speed limits.` },
    road: { live: false, note: `${label} is not queried for road intelligence.` },
  };
}

export function providerStack(env: {
  map?: "open" | "off";
  mapboxToken?: string;
  tomtomKey?: string;
  googleKey?: string;
} = {}): ProviderCapabilities[] {
  return [
    openCapabilities(env.map !== "off"),
    demoCapabilities(),
    vendorCapabilities("mapbox", env.mapboxToken),
    vendorCapabilities("tomtom", env.tomtomKey),
    vendorCapabilities("google", env.googleKey),
  ];
}

export function unsupportedNotes(provider: ProviderCapabilities): string[] {
  const notes: string[] = [];
  if (!provider.navigation.lanes) notes.push("Lane guidance is not provided.");
  if (!provider.traffic.live) notes.push(provider.traffic.note);
  if (!provider.navigation.predictiveTrafficReroute) notes.push("Rerouting watches whether you leave the route. It does not predict traffic.");
  if (!provider.map.offline) notes.push("Offline maps are not available from this provider.");
  if (!provider.map.tilt) notes.push("Tilt is not available.");
  if (!provider.speedLimits.verified) notes.push(provider.speedLimits.note);
  if (!provider.road.live) notes.push(provider.road.note);
  return notes;
}
