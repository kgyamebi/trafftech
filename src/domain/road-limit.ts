import type { GeoPoint } from "./navigation";

export interface TaggedWay {
  id: number;
  name: string | null;
  maxspeed: string | null;
  points: GeoPoint[];
}

export interface MappedLimit {
  kph: number;
  road: string | null;
  metres: number;
}

const MATCH_M = 35;

export function parseMaxspeed(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const parts = raw
    .trim()
    .toLowerCase()
    .replace(/km\/h|kmh|kph/g, "")
    .split(/[;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const speeds = parts.map(parseOne).filter((speed): speed is number => speed != null);
  const unique = [...new Set(speeds)];
  if (unique.length !== 1) return null;
  const kph = unique[0];
  if (kph < 5 || kph > 140) return null;
  return kph;
}

export function roadKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
}

export function chooseRoadLimit(input: {
  road: string | null;
  mappedKph: number | null;
  saved: Record<string, number>;
}): { kph: number | null; source: "openstreetmap" | "user_declared" | "unavailable" } {
  if (input.mappedKph != null && input.mappedKph >= 5 && input.mappedKph <= 140) {
    return { kph: Math.round(input.mappedKph), source: "openstreetmap" };
  }
  const saved = input.road ? input.saved[roadKey(input.road)] : undefined;
  if (saved != null && saved >= 5 && saved <= 140) return { kph: Math.round(saved), source: "user_declared" };
  return { kph: null, source: "unavailable" };
}

export function rememberRoadLimit(saved: Record<string, number>, road: string, kph: number): Record<string, number> {
  const key = roadKey(road);
  if (!key || kph < 5 || kph > 140) return saved;
  const next = { ...saved };
  delete next[key];
  next[key] = Math.round(kph);
  const names = Object.keys(next);
  if (names.length <= 200) return next;
  const trimmed: Record<string, number> = {};
  for (const name of names.slice(-200)) trimmed[name] = next[name];
  return trimmed;
}

export function nearestMappedLimit(point: GeoPoint, ways: TaggedWay[]): MappedLimit | null {
  let best: MappedLimit | null = null;
  for (const way of ways) {
    const kph = parseMaxspeed(way.maxspeed);
    if (kph == null || way.points.length < 2) continue;
    const metres = distanceToWay(point, way.points);
    if (metres > MATCH_M) continue;
    if (!best || metres < best.metres) best = { kph, road: way.name, metres };
  }
  return best;
}

function parseOne(token: string): number | null {
  const mph = /^(\d+(?:\.\d+)?)\s*mph$/.exec(token);
  if (mph) return Math.round(Number(mph[1]) * 1.60934);
  const plain = /^(\d+(?:\.\d+)?)$/.exec(token);
  if (!plain) return null;
  return Math.round(Number(plain[1]));
}

function distanceToWay(point: GeoPoint, line: GeoPoint[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < line.length; index += 1) {
    const a = toMetres(line[index - 1], point);
    const b = toMetres(line[index], point);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const length = abx * abx + aby * aby;
    const t = length === 0 ? 0 : Math.min(1, Math.max(0, (-a.x * abx - a.y * aby) / length));
    best = Math.min(best, Math.hypot(a.x + abx * t, a.y + aby * t));
  }
  return best;
}

function toMetres(point: GeoPoint, origin: GeoPoint): { x: number; y: number } {
  const latScale = 111_320;
  const lngScale = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return { x: (point.lng - origin.lng) * lngScale, y: (point.lat - origin.lat) * latScale };
}
