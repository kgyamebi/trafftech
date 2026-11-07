import { accraParts, accraToday, addDays } from "./dates";
import { isEvasionRequest } from "./inbox";
import { speedCompliance } from "./score";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export type TravelMode = "driving" | "walking" | "cycling";

export interface PlaceHit {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  source?: "openstreetmap" | "USER_PROVIDED";
  phone?: string | null;
  hours?: string | null;
  priceNote?: string | null;
}

export interface Maneuver {
  kind: string;
  text: string;
  distanceFromStartM: number;
  at: GeoPoint;
}

export interface RouteOption {
  id: string;
  label: "Recommended" | "Alternative";
  durationS: number;
  distanceM: number;
  geometry: GeoPoint[];
  steps: Maneuver[];
  trafficAvailable: false;
  trafficNote: string;
  memoryNote?: string;
  warnings?: string[];
}

export type LimitSource = "unavailable" | "user_declared" | "demo_script" | "openstreetmap";
export type LimitConfidence = "none" | "low" | "scripted";

export interface SpeedLimitReading {
  kph: number | null;
  source: LimitSource;
  confidence: LimitConfidence;
  at: string;
  note: string;
}

export type AlertLevel = "critical" | "warning" | "important" | "information";

export interface NavAlert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  source: "demo_script" | "route" | "gps" | "user";
}

export interface DemoFrame {
  index: number;
  point: GeoPoint;
  bearing: number;
  speedKph: number;
  limit: SpeedLimitReading;
  upcoming: { kph: number; metres: number } | null;
  instruction: { text: string; metres: number } | null;
  remainingM: number;
  etaMin: number;
  alert: NavAlert | null;
  geometry: GeoPoint[];
  fadedGeometry: GeoPoint[] | null;
  arrived: boolean;
  narration: string;
}

export type VoiceMode = "off" | "on" | "important" | "navigation";
export type RerouteMode = "auto" | "ask";
export type AppearanceMode = "auto" | "day" | "night";

export const TRAFFIC_NOTE = "Traffic is not available from this provider. Routes are ordered by estimated time.";
export const SPEED_UNAVAILABLE = "Speed limit information unavailable";
export const ACCRA_CENTRE: GeoPoint = { lat: 5.6037, lng: -0.187 };

const ALERT_RANK: Record<AlertLevel, number> = { critical: 0, warning: 1, important: 2, information: 3 };

export function inGhana(point: GeoPoint): boolean {
  return point.lat >= 4.5 && point.lat <= 11.2 && point.lng >= -3.4 && point.lng <= 1.3;
}

export interface MapPin {
  name: string;
  address: string;
  kind: string | null;
  road: string | null;
  area: string | null;
  phone: string | null;
  website: string | null;
  hours: string | null;
  /** Who supplied the hours line. Absent means the map. */
  hoursSource?: "openstreetmap" | "USER_PROVIDED";
  limitKph: number | null;
  source: "openstreetmap";
}

export interface DroppedPlace extends Omit<MapPin, "limitKph"> {
  /** Raw OpenStreetMap maxspeed tag. Parsed only for a road within 80 m. */
  maxspeed: string | null;
}

const PLACE_KINDS: Record<string, string> = {
  hospital: "Hospital",
  clinic: "Clinic",
  pharmacy: "Pharmacy",
  fuel: "Fuel station",
  school: "School",
  university: "University",
  college: "College",
  restaurant: "Restaurant",
  cafe: "Cafe",
  fast_food: "Fast food",
  bank: "Bank",
  atm: "ATM",
  marketplace: "Market",
  bus_station: "Bus station",
  police: "Police station",
  fire_station: "Fire station",
  parking: "Parking",
  hotel: "Hotel",
  supermarket: "Supermarket",
  place_of_worship: "Place of worship",
  library: "Library",
  post_office: "Post office",
  townhall: "Town hall",
  primary: "Road",
  secondary: "Road",
  tertiary: "Road",
  residential: "Road",
  trunk: "Road",
  motorway: "Motorway",
  unclassified: "Road",
};

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanPhone(value: unknown): string | null {
  const phone = clip(value, 40);
  return /^[+0-9][0-9\s().-]{5,}$/.test(phone) ? phone : null;
}

function cleanWebsite(value: unknown): string | null {
  const site = clip(value, 180);
  return /^https?:\/\//i.test(site) ? site : null;
}

function cleanHours(value: unknown): string | null {
  const hours = clip(value, 80);
  if (!hours || /[<>]/.test(hours)) return null;
  return hours;
}

/** Names the OpenStreetMap object under a tap. A distant name does not become the title. */
export function readReverse(body: unknown, tapped: GeoPoint): DroppedPlace {
  const dropped: DroppedPlace = {
    name: "Dropped pin",
    address: "OpenStreetMap has no name for this point.",
    kind: null,
    road: null,
    area: null,
    phone: null,
    website: null,
    hours: null,
    maxspeed: null,
    source: "openstreetmap",
  };
  if (!body || typeof body !== "object") return dropped;
  const row = body as {
    name?: unknown;
    display_name?: unknown;
    lat?: unknown;
    lon?: unknown;
    category?: unknown;
    type?: unknown;
    address?: Record<string, unknown>;
    extratags?: Record<string, unknown>;
  };
  const named = { lat: Number(row.lat), lng: Number(row.lon) };
  const near = Number.isFinite(named.lat) && Number.isFinite(named.lng) && haversine(tapped, named) <= 80;
  const address = row.address ?? {};
  const road = clip(address.road, 80) || null;
  const area = [address.suburb, address.neighbourhood, address.quarter, address.city, address.town, address.state]
    .map((part) => clip(part, 40))
    .filter((part, index, all) => part && all.indexOf(part) === index)
    .slice(0, 3)
    .join(", ") || null;
  const rawName = clip(row.name, 80);
  const kind = near ? PLACE_KINDS[clip(row.type, 40)] ?? null : null;
  const highway = row.category === "highway" && near;
  const name = near && rawName ? rawName : road || "Dropped pin";
  const line = [road && road !== name ? road : null, area].filter((part): part is string => Boolean(part)).join(", ");
  const display = clip(row.display_name, 160);
  const tags = row.extratags ?? {};
  return {
    name,
    address: (line || display || dropped.address).slice(0, 160),
    kind,
    road,
    area,
    phone: near ? cleanPhone(tags.phone ?? tags["contact:phone"]) : null,
    website: near ? cleanWebsite(tags.website ?? tags["contact:website"]) : null,
    hours: near ? cleanHours(tags.opening_hours) : null,
    maxspeed: highway ? clip(tags.maxspeed, 20) || null : null,
    source: "openstreetmap",
  };
}

export function haversine(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** A point `metres` ahead of `origin` along `bearing`, which is degrees clockwise from north. */
export function lookAhead(origin: GeoPoint, bearing: number, metres: number): GeoPoint {
  if (!Number.isFinite(metres) || metres <= 0) return origin;
  const rad = (bearing * Math.PI) / 180;
  const lat = origin.lat + (metres * Math.cos(rad)) / 111_320;
  const lng = origin.lng + (metres * Math.sin(rad)) / (111_320 * Math.cos((origin.lat * Math.PI) / 180));
  return { lat, lng };
}

export function bearingDeg(a: GeoPoint, b: GeoPoint): number {
  const y = Math.sin(((b.lng - a.lng) * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  const x =
    Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) -
    Math.sin((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.cos(((b.lng - a.lng) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function toXY(point: GeoPoint, origin: GeoPoint) {
  const latScale = 111_320;
  const lngScale = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return { x: (point.lng - origin.lng) * lngScale, y: (point.lat - origin.lat) * latScale };
}

export function routeLengthM(line: GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += haversine(line[i - 1], line[i]);
  return total;
}

export interface RouteProgress {
  traveledM: number;
  remainingM: number;
  offRouteM: number;
  /** The point on the route nearest this fix, along the stretch being followed. */
  snapped: GeoPoint;
  bearing: number;
}

interface SegmentHit {
  off: number;
  traveled: number;
  snapped: GeoPoint;
  bearing: number;
  length: number;
}

function fromXY(point: { x: number; y: number }, origin: GeoPoint): GeoPoint {
  const lat = origin.lat + point.y / 111_320;
  const lngScale = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  const lng = origin.lng + (lngScale === 0 ? 0 : point.x / lngScale);
  return { lat, lng };
}

function nearestOnRoute(point: GeoPoint, line: GeoPoint[]): SegmentHit {
  const origin = line[0];
  const p = toXY(point, origin);
  let best: SegmentHit = { off: Infinity, traveled: 0, snapped: line[0], bearing: 0, length: 0 };
  let cursor = 0;
  for (let i = 1; i < line.length; i++) {
    const seg = haversine(line[i - 1], line[i]);
    const a = toXY(line[i - 1], origin);
    const b = toXY(line[i], origin);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const x = a.x + t * dx;
    const y = a.y + t * dy;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < best.off) {
      best = {
        off: d,
        traveled: cursor + seg * t,
        snapped: fromXY({ x, y }, origin),
        bearing: bearingDeg(line[i - 1], line[i]),
        length: 0,
      };
    }
    cursor += seg;
  }
  best.length = cursor;
  return best;
}

/**
 * Follows the route from the last accepted distance.
 * A loop that is only a little nearer does not pull the position backwards or skip a turn.
 * A later part of the route is used when the fix is clearly on that road, not merely nearer by GPS noise.
 */
export function progressAlong(point: GeoPoint, line: GeoPoint[], hintTraveledM?: number | null): RouteProgress {
  if (line.length < 2) {
    const off = line.length ? haversine(point, line[0]) : Infinity;
    return { traveledM: 0, remainingM: 0, offRouteM: off, snapped: line[0] ?? point, bearing: 0 };
  }
  const global = nearestOnRoute(point, line);
  const hint = hintTraveledM != null && Number.isFinite(hintTraveledM) ? hintTraveledM : null;
  if (hint == null) {
    return { traveledM: global.traveled, remainingM: Math.max(0, global.length - global.traveled), offRouteM: global.off, snapped: global.snapped, bearing: global.bearing };
  }
  const origin = line[0];
  const p = toXY(point, origin);
  let windowBest: SegmentHit | null = null;
  let cursor = 0;
  for (let i = 1; i < line.length; i++) {
    const seg = haversine(line[i - 1], line[i]);
    const start = cursor;
    const end = cursor + seg;
    cursor = end;
    if (end < hint - 80 || start > hint + 400) continue;
    const a = toXY(line[i - 1], origin);
    const b = toXY(line[i], origin);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const traveled = start + seg * t;
    if (traveled < hint - 40 || traveled > hint + 400) continue;
    const x = a.x + t * dx;
    const y = a.y + t * dy;
    const d = Math.hypot(p.x - x, p.y - y);
    if (!windowBest || d < windowBest.off) {
      windowBest = { off: d, traveled, snapped: fromXY({ x, y }, origin), bearing: bearingDeg(line[i - 1], line[i]), length: global.length };
    }
  }
  let chosen = global;
  if (windowBest && windowBest.off <= 80) {
    const laterOnRoute = global.traveled > windowBest.traveled + 80;
    const clearlyCloser = global.off + 25 < windowBest.off;
    chosen = laterOnRoute && clearlyCloser ? global : windowBest;
  }
  return {
    traveledM: chosen.traveled,
    remainingM: Math.max(0, global.length - chosen.traveled),
    offRouteM: chosen.off,
    snapped: chosen.snapped,
    bearing: chosen.bearing,
  };
}

/** Drops a fix that would require more than 162 km/h, and damps a small jump. */
export function steadyPosition(previous: (GeoPoint & { at: number }) | null, next: GeoPoint & { at: number }): GeoPoint {
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) {
    return previous ?? next;
  }
  if (!previous) return { lat: next.lat, lng: next.lng };
  const seconds = (next.at - previous.at) / 1000;
  const metres = haversine(previous, next);
  if (seconds > 0 && seconds < 20 && metres / seconds > 45) return { lat: previous.lat, lng: previous.lng };
  if (seconds > 0 && seconds < 2.5 && metres > 0 && metres < 22) {
    return { lat: previous.lat * 0.35 + next.lat * 0.65, lng: previous.lng * 0.35 + next.lng * 0.65 };
  }
  return { lat: next.lat, lng: next.lng };
}

export function decimate(line: GeoPoint[], max: number): GeoPoint[] {
  if (line.length <= max || max < 2) return line.slice(0, Math.max(0, max));
  const out: GeoPoint[] = [];
  const step = (line.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(line[Math.round(i * step)]);
  return out;
}

export function boundsOf(points: GeoPoint[]): { south: number; west: number; north: number; east: number } | null {
  if (!points.length) return null;
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const p of points) {
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
  }
  return { south, west, north, east };
}

export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres)) return "—";
  if (metres < 50) return `${Math.max(0, Math.round(metres))} m`;
  if (metres < 950) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function etaClock(from: Date, minutes: number): string {
  const when = new Date(from.getTime() + Math.max(0, minutes) * 60_000);
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Accra",
  }).format(when);
}

export function etaMinutes(remainingM: number, speedKph: number, routeDurationS: number, routeDistanceM: number): number {
  if (remainingM < 40) return 0;
  if (speedKph >= 8) return Math.max(1, Math.round((remainingM / 1000 / speedKph) * 60));
  if (routeDistanceM <= 0) return 1;
  return Math.max(1, Math.round((routeDurationS * (remainingM / routeDistanceM)) / 60));
}

export function prefersNight(now: Date, mode: AppearanceMode): boolean {
  if (mode === "day") return false;
  if (mode === "night") return true;
  const hour = accraParts(now).hour;
  return hour >= 19 || hour < 6;
}

export function freshness(updatedAt: number | null, now: number): string | null {
  if (updatedAt == null) return null;
  const mins = Math.max(0, Math.round((now - updatedAt) / 60_000));
  if (mins < 1) return "Updated just now";
  return `Last updated ${mins} minute${mins === 1 ? "" : "s"} ago`;
}

export function mapFailureMessage(kind: "off" | "down"): { title: string; detail: string } {
  if (kind === "off") {
    return {
      title: "Maps are not connected.",
      detail: "This build has no map provider. The demonstration still runs, and it does not use your GPS.",
    };
  }
  return {
    title: "Maps are temporarily unavailable.",
    detail: "Retry in a moment. Navigation can keep a route already on this phone, and traffic is not live.",
  };
}

export function locationMessage(status: "ok" | "weak" | "denied" | "unavailable" | "stale" | "demo"): string | null {
  if (status === "weak") return "GPS accuracy reduced";
  if (status === "denied") return "Location is off. You can still search, or enable location in the browser settings for this site.";
  if (status === "unavailable") return "Location unavailable. Check your location settings.";
  if (status === "stale") return "Location is stale.";
  if (status === "demo") return "DEMO · simulated movement, not your GPS";
  return null;
}

export function parseCoordinateQuery(raw: string): GeoPoint | null {
  const match = raw.trim().match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function coordinatePlace(point: GeoPoint): PlaceHit {
  const label = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  return { id: `coord-${label}`, name: "Coordinates", address: `${label}. The point you typed.`, lat: point.lat, lng: point.lng };
}

export function destinationAllowed(query: string): { ok: boolean; reason: string } {
  if (isEvasionRequest(query)) {
    return { ok: false, reason: "Nokware will not search for a way around enforcement. Search for a place." };
  }
  return { ok: true, reason: "" };
}

export function rankRoutes<T extends { durationS: number; distanceM: number }>(routes: T[]): T[] {
  return [...routes].sort((a, b) => a.durationS - b.durationS || a.distanceM - b.distanceM);
}

/** The shortest of the routes already returned. It does not ask for a different road. */
export function shortestRouteId<T extends { id: string; durationS: number; distanceM: number }>(routes: T[]): string | null {
  if (!routes.length) return null;
  return [...routes].sort((a, b) => a.distanceM - b.distanceM || a.durationS - b.durationS)[0].id;
}

/** Straight-line perimeter. Area is the closed shape, and only when asked. Not a driving route. */
export function shapeMeasure(points: GeoPoint[], closed = true): { perimeterM: number; areaM2: number | null } | null {
  if (points.length < 2 || points.some((point) => !Number.isFinite(point.lat) || !Number.isFinite(point.lng))) return null;
  let perimeter = 0;
  for (let index = 1; index < points.length; index += 1) perimeter += haversine(points[index - 1], points[index]);
  if (points.length < 3 || !closed) return { perimeterM: Math.round(perimeter), areaM2: null };
  perimeter += haversine(points[points.length - 1], points[0]);
  const origin = points[0];
  const lat0 = (origin.lat * Math.PI) / 180;
  const xy = points.map((point) => ({
    x: (point.lng - origin.lng) * Math.cos(lat0) * 111_320,
    y: (point.lat - origin.lat) * 110_540,
  }));
  let sum = 0;
  for (let index = 0; index < xy.length; index += 1) {
    const next = xy[(index + 1) % xy.length];
    sum += xy[index].x * next.y - next.x * xy[index].y;
  }
  return { perimeterM: Math.round(perimeter), areaM2: Math.round(Math.abs(sum) / 2) };
}

export interface PinCluster<T extends GeoPoint & { id: string; name: string }> {
  id: string;
  name: string;
  lat: number;
  lng: number;
  count: number;
  ids: string[];
  places: T[];
}

/** Group nearby pins when the map is far out. A close view keeps every pin. */
export function clusterPins<T extends GeoPoint & { id: string; name: string }>(places: T[], zoom: number): PinCluster<T>[] {
  if (places.length === 0) return [];
  if (zoom >= 14) {
    return places.map((place) => ({ id: place.id, name: place.name, lat: place.lat, lng: place.lng, count: 1, ids: [place.id], places: [place] }));
  }
  const reach = 50 * 2 ** (14 - Math.max(5, zoom));
  const groups: PinCluster<T>[] = [];
  for (const place of places) {
    const group = groups.find((item) => haversine(item, place) <= reach);
    if (!group) {
      groups.push({ id: place.id, name: place.name, lat: place.lat, lng: place.lng, count: 1, ids: [place.id], places: [place] });
      continue;
    }
    group.places.push(place);
    group.ids.push(place.id);
    group.count += 1;
    group.lat = group.places.reduce((sum, item) => sum + item.lat, 0) / group.count;
    group.lng = group.places.reduce((sum, item) => sum + item.lng, 0) / group.count;
    group.name = `${group.count} places`;
    group.id = `cluster:${group.ids[0]}`;
  }
  return groups;
}

/** Zoom that shows each pin. Grouping stops at 14, so a tap must reach at least that. */
export function clusterOpenZoom(fromZoom: number): number {
  const zoom = Number.isFinite(fromZoom) ? fromZoom : 10;
  return Math.min(19, Math.max(14, Math.floor(zoom) + 1));
}

export function chooseAlert(alerts: NavAlert[]): NavAlert | null {
  if (!alerts.length) return null;
  return [...alerts].sort((a, b) => ALERT_RANK[a.level] - ALERT_RANK[b.level])[0];
}

export function movementStatus(speedKph: number, limitKph: number | null): "UNKNOWN" | "SAFE" | "AT LIMIT" | "OVER" {
  if (limitKph == null) return "UNKNOWN";
  if (speedKph > limitKph + 1) return "OVER";
  if (speedKph >= limitKph - 2) return "AT LIMIT";
  return "SAFE";
}

export function rerouteDecision(input: { offRouteM: number; consecutive: number; mode: RerouteMode; accuracyM?: number | null }): "none" | "auto" | "ask" {
  const accuracy = input.accuracyM != null && Number.isFinite(input.accuracyM) && input.accuracyM > 0 ? input.accuracyM : 0;
  const gate = accuracy > 0 ? Math.max(60, Math.min(180, accuracy * 1.5)) : 60;
  const need = accuracy > 50 ? 3 : 2;
  if (input.offRouteM < gate || input.consecutive < need) return "none";
  return input.mode === "auto" ? "auto" : "ask";
}

export function shouldSpeak(mode: VoiceMode, kind: "guidance" | AlertLevel): boolean {
  if (mode === "off") return false;
  if (mode === "navigation") return kind === "guidance";
  if (mode === "on") return true;
  return kind === "critical" || kind === "warning" || kind === "important";
}

export function distanceBucket(metres: number): number {
  if (metres > 800) return 1000;
  if (metres > 400) return 800;
  if (metres > 200) return 400;
  if (metres > 80) return 200;
  return 50;
}

export function guidancePhrase(text: string, metres: number): string {
  if (/arrive/i.test(text) || metres <= 25) return text.endsWith(".") ? text : `${text}.`;
  const rounded = Math.max(10, Math.round(metres / 10) * 10);
  return `${text} in ${rounded} metres.`;
}

export interface SpeedLimitQuery {
  at: string;
  location: GeoPoint | null;
  declaredKph: number | null;
  mapped: { kph: number; road: string | null } | null;
  demo: SpeedLimitReading | null;
}

export interface SpeedLimitProvider {
  getApplicableSpeedLimit(query: SpeedLimitQuery): SpeedLimitReading;
  getCurrentLimit(query: SpeedLimitQuery): SpeedLimitReading;
  getUpcomingSpeedLimitChanges(change: { kph: number; metres: number } | null): { kph: number; metres: number; source: "demo_script"; note: string } | null;
  getUpcomingSpeedChange(change: { kph: number; metres: number } | null): { kph: number; metres: number; source: "demo_script"; note: string } | null;
  getSpeedLimitConfidence(reading: SpeedLimitReading): LimitConfidence;
  getLimitConfidence(reading: SpeedLimitReading): LimitConfidence;
  getLimitSource(reading: SpeedLimitReading): LimitSource;
}

function unavailable(at: string): SpeedLimitReading {
  return { kph: null, source: "unavailable", confidence: "none", at, note: SPEED_UNAVAILABLE };
}

export const speedLimitProvider: SpeedLimitProvider = {
  getApplicableSpeedLimit(query) {
    if (query.demo) return query.demo;
    if (query.declaredKph != null && query.declaredKph >= 5 && query.declaredKph <= 140) {
      return {
        kph: Math.round(query.declaredKph),
        source: "user_declared",
        confidence: "low",
        at: query.at,
        note: "You set this limit. It is not a verified road dataset. The posted sign controls.",
      };
    }
    if (query.mapped && query.mapped.kph >= 5 && query.mapped.kph <= 140) {
      const road = query.mapped.road ? `${query.mapped.road} is tagged` : "This road is tagged";
      return {
        kph: Math.round(query.mapped.kph),
        source: "openstreetmap",
        confidence: "low",
        at: query.at,
        note: `OpenStreetMap: ${road} ${Math.round(query.mapped.kph)} km/h. The posted sign controls. This is not an official feed.`,
      };
    }
    return unavailable(query.at);
  },
  getCurrentLimit(query) {
    return this.getApplicableSpeedLimit(query);
  },
  getUpcomingSpeedLimitChanges(change) {
    if (!change) return null;
    return { ...change, source: "demo_script", note: "Scripted for this demonstration. Not a verified limit." };
  },
  getUpcomingSpeedChange(change) {
    return this.getUpcomingSpeedLimitChanges(change);
  },
  getSpeedLimitConfidence(reading) {
    return reading.confidence;
  },
  getLimitConfidence(reading) {
    return reading.confidence;
  },
  getLimitSource(reading) {
    return reading.source;
  },
};

export interface RoadNote {
  id: string;
  title: string;
  detail: string;
  confidence: "high";
  source: "demo_script";
}

export function roadNotesFor(alert: NavAlert | null): RoadNote[] {
  if (!alert || alert.source !== "demo_script") return [];
  if (alert.level === "information" && /route/i.test(alert.title)) return [];
  return [{ id: alert.id, title: alert.title, detail: alert.detail, confidence: "high", source: "demo_script" }];
}

export function rememberPlace(list: PlaceHit[], hit: PlaceHit, max = 8): PlaceHit[] {
  return [hit, ...list.filter((item) => item.id !== hit.id)].slice(0, max);
}

export function forgetPlace(list: PlaceHit[], id: string): PlaceHit[] {
  return list.filter((item) => item.id !== id);
}

export function withDistance<T extends GeoPoint>(places: T[], from: GeoPoint | null): (T & { distanceM: number | null })[] {
  return places.map((place) => ({ ...place, distanceM: from ? Math.round(haversine(from, place)) : null }));
}

export type TripWindow = "today" | "week" | "month" | "custom";

export function filterTrips<T extends { endedAt: string }>(trips: T[], window: TripWindow, now: Date, custom?: { from: string; to: string }): T[] {
  const today = accraToday(now);
  return trips.filter((trip) => {
    const day = trip.endedAt.slice(0, 10);
    if (window === "today") return day === today;
    if (window === "week") return day >= addDays(today, -6) && day <= today;
    if (window === "month") return day >= addDays(today, -29) && day <= today;
    if (!custom?.from || !custom?.to) return false;
    const from = custom.from <= custom.to ? custom.from : custom.to;
    const to = custom.from <= custom.to ? custom.to : custom.from;
    return day >= from && day <= to;
  });
}

/** Average time from this account's own drives of a similar length. It never replaces the route estimate. */
export function similarDriveNote(
  trips: { distanceM: number | null; minutes: number; simulated?: boolean; source?: string }[],
  distanceM: number,
): string | null {
  if (!Number.isFinite(distanceM) || distanceM < 500) return null;
  const similar = trips.filter((trip) => {
    if (trip.simulated || trip.distanceM == null || trip.minutes < 1) return false;
    const ratio = trip.distanceM / distanceM;
    return ratio >= 0.8 && ratio <= 1.25;
  });
  if (similar.length < 3) return null;
  const mean = Math.round(similar.reduce((sum, trip) => sum + trip.minutes, 0) / similar.length);
  const demonstration = similar.every((trip) => trip.source === "DEMO");
  const whose = demonstration ? "Demonstration drives" : "Your saved drives";
  const tail = demonstration ? "This is not your driving, and it does not change the estimate." : "Calculated from those trips. This does not change the estimate.";
  return `${whose} of a similar length, ${similar.length} of them, took about ${mean} min. ${tail}`;
}

export function tripComparison(current: number | null, previous: number | null): string | null {
  if (current == null || previous == null) return null;
  const delta = Math.round(current - previous);
  if (delta >= 5) return `Speed compliance was ${delta} points higher than the previous saved trip.`;
  if (delta <= -5) return `Speed compliance was ${Math.abs(delta)} points lower than the previous saved trip.`;
  return "Speed compliance was close to the previous saved trip.";
}

export function closingLine(input: { demo: boolean; compliance: number | null; harshBrakes: number }): string {
  if (input.demo) return "This demonstration is not saved and does not change your driver score.";
  if (input.compliance == null) return "This trip is saved. It does not change your score, because no speed limit was available to compare.";
  if (input.compliance >= 95 && input.harshBrakes === 0) return "Great drive.";
  if (input.compliance < 80) return "Part of this trip was above the limit you were using.";
  return "Trip saved.";
}

export const HARSH_BRAKE_DROP = 22;
export const HARSH_ACCEL_RISE = 20;

export function countHarsh(samples: { speedKph: number }[]): { brakes: number; accels: number } {
  let brakes = 0;
  let accels = 0;
  for (let i = 1; i < samples.length; i++) {
    const delta = samples[i].speedKph - samples[i - 1].speedKph;
    if (delta <= -HARSH_BRAKE_DROP) brakes += 1;
    if (delta >= HARSH_ACCEL_RISE) accels += 1;
  }
  return { brakes, accels };
}

export type DriveEventType =
  | "TRIP_STARTED"
  | "TRIP_ENDED"
  | "SPEED_LIMIT_CHANGED"
  | "ROUTE_CHANGED"
  | "HAZARD_DETECTED"
  | "TRAFFIC_CHANGED"
  | "HARD_BRAKING"
  | "RAPID_ACCELERATION"
  | "DESTINATION_REACHED";

export interface DriveEvent {
  type: DriveEventType;
  at: string;
  location: GeoPoint | null;
  source: "device" | "demo_script" | "user" | "provider";
  confidence: "high" | "low" | "scripted";
  metadata: Record<string, string | number | boolean | null>;
}

export function makeEvent(event: DriveEvent): DriveEvent {
  return event;
}

const PRIMARY: GeoPoint[] = [
  { lat: 5.6052, lng: -0.1718 },
  { lat: 5.6124, lng: -0.1664 },
  { lat: 5.6186, lng: -0.1602 },
  { lat: 5.6234, lng: -0.1554 },
  { lat: 5.6272, lng: -0.1528 },
  { lat: 5.6314, lng: -0.151 },
  { lat: 5.6358, lng: -0.1496 },
];

const ALTERNATE: GeoPoint[] = [
  { lat: 5.6234, lng: -0.1554 },
  { lat: 5.6262, lng: -0.1576 },
  { lat: 5.6304, lng: -0.1542 },
  { lat: 5.6336, lng: -0.1514 },
  { lat: 5.6358, lng: -0.1496 },
];

function pointAlong(line: GeoPoint[], distance: number): { point: GeoPoint; bearing: number } {
  let left = Math.max(0, distance);
  for (let i = 1; i < line.length; i++) {
    const seg = haversine(line[i - 1], line[i]);
    if (left <= seg || i === line.length - 1) {
      const t = seg === 0 ? 0 : Math.min(1, left / seg);
      return {
        point: {
          lat: line[i - 1].lat + (line[i].lat - line[i - 1].lat) * t,
          lng: line[i - 1].lng + (line[i].lng - line[i - 1].lng) * t,
        },
        bearing: bearingDeg(line[i - 1], line[i]),
      };
    }
    left -= seg;
  }
  return { point: line[line.length - 1], bearing: 0 };
}

const DEMO_AT = "demo-script";

function scriptedLimit(kph: number): SpeedLimitReading {
  return {
    kph,
    source: "demo_script",
    confidence: "scripted",
    at: DEMO_AT,
    note: "Scripted for this demonstration. Not a verified speed limit.",
  };
}

export function buildDemoFrames(): DemoFrame[] {
  const primaryLength = routeLengthM(PRIMARY);
  const altLength = routeLengthM(ALTERNATE);
  const speeds = [42, 44, 46, 46, 44, 42, 40, 42, 40, 36, 42, 34, 30, 30, 28, 26, 30, 32, 30, 28, 24, 18, 12, 0];
  const frames: DemoFrame[] = [];
  for (let index = 0; index < 24; index++) {
    const rerouted = index >= 16;
    const line = rerouted ? ALTERNATE : PRIMARY;
    const length = rerouted ? altLength : primaryLength;
    const fraction = rerouted ? (index - 16) / 7 : index / 16;
    const travelled = Math.min(length, fraction * length);
    const spot = pointAlong(line, travelled);
    const remaining = Math.max(0, Math.round(length - travelled));
    const limitKph = index >= 11 ? 30 : 50;
    const upcoming = index >= 8 && index < 11 ? { kph: 30, metres: index === 8 ? 300 : index === 9 ? 180 : 80 } : null;
    let instruction: DemoFrame["instruction"] = { text: "Continue", metres: Math.max(40, remaining) };
    let alert: NavAlert | null = null;
    let narration = "The demonstration is moving through Airport City.";
    if (index < 2) {
      narration = "Let's see how Drive works.";
      instruction = { text: "Head north", metres: 800 };
    } else if (index < 8) {
      instruction = { text: "Turn right", metres: Math.max(80, 700 - index * 70) };
    } else if (index < 11) {
      narration = "Approaching a new speed zone.";
      instruction = { text: "Turn right", metres: upcoming?.metres ?? 80 };
      alert = {
        id: "limit-ahead",
        level: "warning",
        title: "LIMIT 30 AHEAD",
        detail: "Scripted speed zone. Not a verified limit, and not a camera warning.",
        source: "demo_script",
      };
    } else if (index < 14) {
      narration = "Nokware shows you what is changing around you.";
      instruction = { text: "Continue", metres: 400 };
      alert = {
        id: "limit-now",
        level: "warning",
        title: "LIMIT NOW 30 km/h",
        detail: "The demonstration limit is now 30. This is not an official posting.",
        source: "demo_script",
      };
    } else if (index < 16) {
      narration = "A scripted traffic note appears. It is not live traffic.";
      instruction = { text: "Continue", metres: 260 };
      alert = {
        id: "congestion",
        level: "important",
        title: "Heavy congestion ahead",
        detail: "Scripted for this demonstration. This is not live traffic.",
        source: "demo_script",
      };
    } else if (index < 19) {
      narration = "The demonstration recalculates onto another road.";
      instruction = { text: "Keep left", metres: 220 };
      alert = {
        id: "reroute",
        level: "information",
        title: "New route",
        detail: "Scripted alternative, chosen for the demonstration. Routes are not chosen to avoid enforcement.",
        source: "demo_script",
      };
    }
    const arrived = index === 23;
    if (arrived) {
      narration = "You have arrived at East Legon.";
      instruction = { text: "Arrive", metres: 0 };
      alert = null;
    }
    const speedKph = speeds[index] ?? 0;
    frames.push({
      index,
      point: spot.point,
      bearing: spot.bearing,
      speedKph,
      limit: scriptedLimit(limitKph),
      upcoming,
      instruction,
      remainingM: arrived ? 0 : remaining,
      etaMin: arrived ? 0 : Math.max(1, Math.round(remaining / 1000 / Math.max(speedKph, 20) * 60)),
      alert,
      geometry: line,
      fadedGeometry: rerouted && index < 19 ? PRIMARY : null,
      arrived,
      narration,
    });
  }
  return frames;
}

export class DemoLocationPlayer {
  index = 0;
  constructor(readonly frames: DemoFrame[]) {}
  current(): DemoFrame {
    return this.frames[Math.min(this.index, this.frames.length - 1)];
  }
  advance(): DemoFrame {
    this.index = Math.min(this.frames.length - 1, this.index + 1);
    return this.current();
  }
  get done(): boolean {
    return this.index >= this.frames.length - 1;
  }
}

export function summariseScript(frames: DemoFrame[]): {
  distanceM: number;
  compliance: number | null;
  harshBrakes: number;
  harshAccels: number;
  samples: { speedKph: number; limitKph: number }[];
} {
  const moving = frames.filter((frame) => frame.limit.kph != null);
  const samples = moving.map((frame) => ({ speedKph: frame.speedKph, limitKph: frame.limit.kph as number }));
  const harsh = countHarsh(samples);
  const distanceM = Math.round(routeLengthM(PRIMARY));
  return { distanceM, compliance: speedCompliance(samples), harshBrakes: harsh.brakes, harshAccels: harsh.accels, samples };
}

function exitOrdinal(exit: number | undefined): string {
  if (exit == null || !Number.isInteger(exit) || exit < 1 || exit > 12) return "";
  const teen = exit % 100;
  const suffix = teen >= 11 && teen <= 13 ? "th" : exit % 10 === 1 ? "st" : exit % 10 === 2 ? "nd" : exit % 10 === 3 ? "rd" : "th";
  return `${exit}${suffix}`;
}

export function maneuverText(type: string, modifier: string | undefined, name: string, exit?: number): string {
  const onto = name ? ` onto ${name}` : "";
  if (type === "arrive") return name ? `Arrive at ${name}` : "Arrive";
  if (type === "depart") return name ? `Head onto ${name}` : "Head out";
  if (type === "roundabout" || type === "rotary") {
    const nth = exitOrdinal(exit);
    return nth ? `Take the ${nth} exit${onto}` : "Take the roundabout";
  }
  if (type === "exit roundabout" || type === "exit rotary") return name ? `Exit onto ${name}` : "Exit the roundabout";
  if (type === "off ramp") return modifier?.includes("left") ? "Exit left" : "Exit right";
  if (type === "fork" || type === "merge") return modifier?.includes("left") ? "Keep left" : "Keep right";
  if (type === "turn" || type === "end of road") {
    if (modifier === "uturn") return "Make a U-turn";
    if (modifier === "sharp left") return "Turn sharp left";
    if (modifier === "sharp right") return "Turn sharp right";
    if (modifier === "slight left") return `Bear left${onto}`;
    if (modifier === "slight right") return `Bear right${onto}`;
    if (modifier === "left") return `Turn left${onto}`;
    if (modifier === "right") return `Turn right${onto}`;
    if (modifier === "straight") return name ? `Continue on ${name}` : "Continue";
  }
  if (name) return `Continue on ${name}`;
  return "Continue";
}

interface OsrmStep {
  distance?: number;
  name?: string;
  maneuver?: { type?: string; modifier?: string; exit?: number; location?: [number, number] };
  intersections?: { lanes?: { indications?: string[]; valid?: boolean }[] }[];
}

function lanePhrase(step: OsrmStep): string {
  const valid = (step.intersections ?? []).flatMap((item) => item.lanes ?? []).filter((lane) => lane.valid && lane.indications?.length);
  const marks = [...new Set(valid.flatMap((lane) => lane.indications ?? []))].filter(Boolean).slice(0, 3);
  return marks.length ? ` Use the lane marked ${marks.join(" or ")}.` : "";
}

interface OsrmRoute {
  distance?: number;
  duration?: number;
  geometry?: { coordinates?: [number, number][] };
  legs?: { steps?: OsrmStep[] }[];
}

export function parseOsrm(body: unknown): { ok: true; routes: RouteOption[] } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "No route was found." };
  const code = "code" in body ? String((body as { code: unknown }).code) : "";
  if (code !== "Ok") return { ok: false, message: "No route was found." };
  const raw = Array.isArray((body as { routes?: unknown }).routes) ? ((body as { routes: OsrmRoute[] }).routes) : [];
  const parsed: RouteOption[] = [];
  raw.forEach((route, index) => {
    const coords = route.geometry?.coordinates ?? [];
    const geometry: GeoPoint[] = coords
      .filter((pair) => Array.isArray(pair) && pair.length >= 2 && Number.isFinite(pair[1]) && Number.isFinite(pair[0]))
      .map(([lng, lat]) => ({ lat, lng }));
    if (geometry.length < 2) return;
    let cursor = 0;
    const steps: Maneuver[] = [];
    for (const leg of route.legs ?? []) {
      for (const step of leg.steps ?? []) {
        const loc = step.maneuver?.location;
        const at = loc && loc.length >= 2 ? { lng: loc[0], lat: loc[1] } : geometry[0];
        const spoken = maneuverText(step.maneuver?.type || "continue", step.maneuver?.modifier, step.name || "", step.maneuver?.exit);
        steps.push({
          kind: step.maneuver?.type || "continue",
          text: lanePhrase(step) ? `${spoken.replace(/\.$/, "")}. ${lanePhrase(step).trim()}` : spoken,
          distanceFromStartM: Math.round(cursor),
          at,
        });
        cursor += Number(step.distance) || 0;
      }
    }
    parsed.push({
      id: `route-${index}`,
      label: "Alternative",
      durationS: Math.max(0, Math.round(Number(route.duration) || 0)),
      distanceM: Math.max(0, Math.round(Number(route.distance) || routeLengthM(geometry))),
      geometry,
      steps,
      trafficAvailable: false,
      trafficNote: TRAFFIC_NOTE,
    });
  });
  const ranked = rankRoutes(parsed).map((route, index) => ({
    ...route,
    id: `route-${index}`,
    label: index === 0 ? ("Recommended" as const) : ("Alternative" as const),
  }));
  if (!ranked.length) return { ok: false, message: "No route was found." };
  return { ok: true, routes: ranked };
}

interface NominatimRow {
  place_id?: number | string;
  display_name?: string;
  lat?: string;
  lon?: string;
  name?: string;
}

export function parseNominatim(body: unknown): PlaceHit[] {
  if (!Array.isArray(body)) return [];
  const hits: PlaceHit[] = [];
  for (const row of body as NominatimRow[]) {
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const display = String(row.display_name || "").trim();
    const name = String(row.name || display.split(",")[0] || "Place").trim();
    const address = display.replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},\\s*`), "") || display;
    hits.push({ id: String(row.place_id ?? `${lat},${lng}`), name, address, lat, lng });
  }
  return hits.slice(0, 6);
}

export function nextInstruction(traveledM: number, steps: Maneuver[]): { text: string; metres: number } | null {
  const upcoming = steps.find((step) => step.kind !== "depart" && step.distanceFromStartM >= traveledM - 20);
  if (!upcoming) {
    const last = steps[steps.length - 1];
    if (!last) return null;
    return { text: last.text, metres: 0 };
  }
  return { text: upcoming.text, metres: Math.max(0, Math.round(upcoming.distanceFromStartM - traveledM)) };
}

/** The maneuver after the one currently shown, when the route has one. */
export function followingInstruction(traveledM: number, steps: Maneuver[]): { text: string; metres: number } | null {
  const upcoming = steps.filter((step) => step.kind !== "depart" && step.distanceFromStartM >= traveledM - 20);
  const next = upcoming[1];
  if (!next || next.text === upcoming[0]?.text) return null;
  return { text: next.text, metres: Math.max(0, Math.round(next.distanceFromStartM - traveledM)) };
}

/** Turns on a route before navigation starts. Distance is the stretch before each turn. */
export function turnList(steps: Maneuver[], limit = 6): { text: string; metres: number }[] {
  const listed: { text: string; metres: number }[] = [];
  let previous = 0;
  for (const step of steps) {
    if (step.kind === "depart") {
      previous = step.distanceFromStartM;
      continue;
    }
    if (!step.text || (listed.length && listed[listed.length - 1].text === step.text)) continue;
    listed.push({ text: step.text, metres: Math.max(0, Math.round(step.distanceFromStartM - previous)) });
    previous = step.distanceFromStartM;
    if (listed.length >= limit) break;
  }
  return listed;
}

/** The line already driven, and the line still ahead. The join is the point at traveledM. */
export function splitRoute(line: GeoPoint[], traveledM: number): { done: GeoPoint[]; left: GeoPoint[] } {
  if (line.length < 2) return { done: [...line], left: [...line] };
  const target = Math.max(0, traveledM);
  let cursor = 0;
  for (let i = 1; i < line.length; i++) {
    const seg = haversine(line[i - 1], line[i]);
    const reach = cursor + seg;
    if (target <= reach || i === line.length - 1) {
      const t = seg <= 0 ? 1 : Math.max(0, Math.min(1, (target - cursor) / seg));
      const mid = {
        lat: line[i - 1].lat + (line[i].lat - line[i - 1].lat) * t,
        lng: line[i - 1].lng + (line[i].lng - line[i - 1].lng) * t,
      };
      const done = [...line.slice(0, i), mid];
      const left = [mid, ...line.slice(i)];
      return {
        done: done.length >= 2 ? done : [line[0], mid],
        left: left.length >= 2 ? left : [mid, line[line.length - 1]],
      };
    }
    cursor = reach;
  }
  return { done: [...line], left: line.slice(-2) };
}

/** Distance, action, and road, split so the distance can be read first. */
export function guidanceFace(text: string): { action: string; road: string; lane: string } {
  const laneAt = text.search(/\s+Use the lane marked /);
  const lane = laneAt >= 0 ? text.slice(laneAt).trim().replace(/\.$/, "") : "";
  const body = (laneAt >= 0 ? text.slice(0, laneAt) : text).replace(/\.$/, "").trim();
  const onto = body.match(/^(.*?) onto (.+)$/);
  if (onto) return { action: onto[1], road: onto[2], lane };
  const named = body.match(/^(Continue|Head|Exit|Arrive) (?:on|at) (.+)$/);
  if (named) return { action: named[1] === "Arrive" ? "Arrive" : named[1], road: named[2], lane };
  return { action: body || "Continue", road: "", lane };
}

/** How another returned route differs from the recommended one. Both figures are the provider's estimate. */
export function routeDelta(route: { durationS: number; distanceM: number }, recommended: { durationS: number; distanceM: number }): string {
  const minutes = Math.round((route.durationS - recommended.durationS) / 60);
  const metres = route.distanceM - recommended.distanceM;
  const time = minutes === 0 ? "Same estimated time" : minutes > 0 ? `${minutes} min longer` : `${Math.abs(minutes)} min shorter`;
  const distance = Math.abs(metres) < 50 ? "about the same distance" : metres > 0 ? `${formatDistance(metres)} longer` : `${formatDistance(Math.abs(metres))} shorter`;
  return `${time} · ${distance}`;
}

export interface MapProvider {
  id: string;
  label: string;
  modes: TravelMode[];
  initialize(): Promise<{ ok: boolean; message: string }>;
  searchPlaces(query: string): Promise<PlaceHit[]>;
  geocode(query: string): Promise<PlaceHit | null>;
  reverseGeocode(point: GeoPoint): Promise<string | null>;
  calculateRoute(from: GeoPoint, to: GeoPoint, mode: TravelMode, via?: GeoPoint | null): Promise<RouteOption[]>;
  getRouteAlternatives(from: GeoPoint, to: GeoPoint, mode: TravelMode): Promise<RouteOption[]>;
  getCurrentLocation(): Promise<{ available: false; note: string }>;
  startNavigation(): void;
  stopNavigation(): void;
  updateTraffic(): Promise<{ available: false; note: string }>;
  dispose(): void;
}

export const OPEN_PROVIDER_MODES: TravelMode[] = ["driving", "walking", "cycling"];
