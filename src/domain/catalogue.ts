import { haversine, inGhana, type GeoPoint, type PlaceHit, type RouteOption } from "./navigation";

/** Nearby searches the map is willing to run. The query is fixed so a driver cannot turn it into a free search. */
export const NEARBY = [
  { label: "Hospital", query: "hospital", kind: "hospital" },
  { label: "Pharmacy", query: "pharmacy", kind: "pharmacy" },
  { label: "Fuel", query: "fuel station", kind: "fuel" },
  { label: "Police", query: "police", kind: null },
  { label: "School", query: "school", kind: "school" },
  { label: "Market", query: "market", kind: "market" },
  { label: "Bank", query: "bank", kind: null },
  { label: "Restaurant", query: "restaurant", kind: "restaurant" },
  { label: "Hotel", query: "hotel", kind: null },
  { label: "ATM", query: "atm", kind: "atm" },
  { label: "Bus stop", query: "bus stop", kind: null },
  { label: "Train", query: "train station", kind: null },
  { label: "Parking", query: "parking", kind: "parking" },
  { label: "Trotro", query: "trotro", kind: "trotro_station" },
  { label: "Taxi rank", query: "taxi", kind: "taxi_rank" },
  { label: "Lorry station", query: "lorry park", kind: "lorry_station" },
  { label: "Rural hub", query: "rural transport", kind: "rural_hub" },
  { label: "Church", query: "church", kind: "church" },
  { label: "Mosque", query: "mosque", kind: "mosque" },
  { label: "Toilet", query: "toilet", kind: "toilet" },
  { label: "Mobile money", query: "mobile money", kind: "momo" },
  { label: "Shop", query: "shop", kind: "shop" },
  { label: "Landmark", query: "attraction", kind: null },
] as const;

const HOLD_MS = 6 * 60 * 60 * 1000;

export function nearbyAllowed(query: string): boolean {
  return NEARBY.some((item) => item.query === query);
}

export function nearbyKind(query: string): string | null {
  return NEARBY.find((item) => item.query === query)?.kind ?? null;
}

/** Empty is allowed. A value that is not a phone is refused. */
/** Digits that can be placed in a tel link. Shorter text is kept as writing, not a call. */
export function callablePhone(value: string): string {
  const callable = value.replace(/[^\d+]/g, "");
  return callable.length >= 6 ? callable : "";
}

export function placePhone(value: string): string | null {
  const phone = value.trim().slice(0, 40);
  if (!phone) return "";
  return /^[+0-9][0-9\s().-]{5,}$/.test(phone) ? phone : null;
}

/** Empty is allowed. Markup is refused. The text is not treated as open or closed. */
export function placeHours(value: string): string | null {
  const hours = value.trim().slice(0, 80);
  if (!hours) return "";
  if (/[<>]/.test(hours)) return null;
  return hours;
}

export function loose(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function closeText(query: string, name: string): boolean {
  const q = loose(query);
  const n = loose(name);
  if (q.length < 3 || n.length < 2) return n === q && q.length >= 2;
  if (n.includes(q) || (q.length >= 4 && n.length >= 4 && q.includes(n))) return true;
  if (q.length < 4 || Math.abs(q.length - n.length) > 1) return false;
  let i = 0;
  let j = 0;
  let skips = 0;
  while (i < q.length && j < n.length) {
    if (q[i] === n[j]) {
      i += 1;
      j += 1;
    } else {
      skips += 1;
      if (skips > 1) return false;
      if (q.length === n.length) {
        i += 1;
        j += 1;
      } else if (q.length > n.length) i += 1;
      else j += 1;
    }
  }
  return skips + (q.length - i) + (n.length - j) <= 1;
}

/** A saved or confirmed name can match when one character is off, including inside one word of the name. */
export function spellingClose(query: string, name: string): boolean {
  if (closeText(query, name)) return true;
  return name.split(/\s+/).some((word) => closeText(query, word));
}

export interface MapMark {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: "place" | "report";
  detail: string;
}

export interface ListedPlace {
  id: string;
  kind: string;
  label: string;
  name: string;
  note: string;
  lat: number;
  lng: number;
  phone?: string;
  hours?: string;
}

export function placesForQuery(places: ListedPlace[], query: string, point: GeoPoint): ListedPlace[] {
  const kind = nearbyKind(query);
  if (!kind) return [];
  return places
    .filter((place) => place.kind === kind && haversine(point, place) <= 3_000)
    .sort((a, b) => haversine(point, a) - haversine(point, b))
    .slice(0, 6);
}

export function localPlaceHits(
  query: string,
  saved: { id: string; name: string; address: string; lat: number; lng: number }[],
  known: { id: string; name: string; detail: string; lat: number; lng: number; kind: string }[],
): PlaceHit[] {
  const hits: PlaceHit[] = [];
  for (const place of saved) {
    if (!spellingClose(query, place.name)) continue;
    hits.push({
      id: place.id,
      name: place.name,
      address: place.address || "Saved on this account",
      lat: place.lat,
      lng: place.lng,
      source: "USER_PROVIDED",
    });
  }
  for (const place of known) {
    if (place.kind !== "place" || !spellingClose(query, place.name)) continue;
    if (hits.some((hit) => haversine(hit, place) < 80 && loose(hit.name) === loose(place.name))) continue;
    hits.push({
      id: place.id,
      name: place.name,
      address: place.detail || "Confirmed by drivers",
      lat: place.lat,
      lng: place.lng,
      source: "USER_PROVIDED",
    });
  }
  return hits.slice(0, 5);
}

export function mergePlaceHits(local: PlaceHit[], remote: PlaceHit[]): PlaceHit[] {
  const rest = remote.filter((hit) => !local.some((own) => haversine(own, hit) < 80 && (loose(own.name) === loose(hit.name) || loose(hit.name).includes(loose(own.name)))));
  return [...local, ...rest].slice(0, 8);
}

export function fuelEstimate(distanceM: number, litresPer100km: number | null, pricePerLitre: number | null): { litres: number; costGhs: number | null; note: string } | null {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return null;
  if (litresPer100km == null || !Number.isFinite(litresPer100km) || litresPer100km < 2 || litresPer100km > 40) return null;
  const litres = Math.round((distanceM / 1000) * (litresPer100km / 100) * 10) / 10;
  const priced = pricePerLitre != null && Number.isFinite(pricePerLitre) && pricePerLitre >= 1 && pricePerLitre <= 40;
  return {
    litres,
    costGhs: priced ? Math.round(litres * pricePerLitre * 100) / 100 : null,
    note: priced
      ? "Calculated from the consumption and the price you entered. This is not a station bill."
      : "Calculated from the consumption you entered. No price was entered, so the cost is not shown.",
  };
}

export function estimateShare(input: { destination: string; duration: string; distance: string; at: string; traffic: string; extra: string }): string {
  const extra = input.extra ? ` ${input.extra}` : "";
  return `${input.destination}. Estimated ${input.duration}, ${input.distance}. This estimate was taken at ${input.at}. ${input.traffic}${extra} This is not a live arrival.`;
}

export function tripShare(input: { origin: string; destination: string; when: string; distance: string; minutes: number; compliance: number | null }): string {
  const compliance = input.compliance == null ? "" : ` Speed compliance ${input.compliance}% from the samples saved with the drive.`;
  return `Saved drive from ${input.origin} to ${input.destination} on ${input.when}. ${input.distance}, ${input.minutes} min.${compliance} This is the saved trip, not a live location.`;
}

export function routeHoldFrom(raw: unknown, now = Date.now()): { destination: PlaceHit; routes: RouteOption[]; selectedId: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { at?: unknown; destination?: PlaceHit; routes?: RouteOption[]; selectedId?: unknown };
  if (typeof row.at !== "number" || !Number.isFinite(row.at) || now - row.at > HOLD_MS || row.at > now) return null;
  const dest = row.destination;
  if (!dest || typeof dest.name !== "string" || !Number.isFinite(dest.lat) || !Number.isFinite(dest.lng) || !inGhana(dest)) return null;
  if (!Array.isArray(row.routes) || row.routes.length === 0 || row.routes.length > 3) return null;
  const routes = row.routes.filter((route) => {
    if (!route || typeof route.id !== "string" || typeof route.durationS !== "number" || typeof route.distanceM !== "number") return false;
    if (!Array.isArray(route.geometry) || route.geometry.length < 2 || route.geometry.length > 4_000) return false;
    return route.geometry.every((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng));
  });
  if (routes.length !== row.routes.length) return null;
  const selectedId = typeof row.selectedId === "string" && routes.some((route) => route.id === row.selectedId) ? row.selectedId : routes[0].id;
  return {
    destination: { id: String(dest.id || "held"), name: dest.name.slice(0, 80), address: String(dest.address ?? "").slice(0, 160), lat: dest.lat, lng: dest.lng },
    routes,
    selectedId,
  };
}
