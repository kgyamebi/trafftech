import { haversine, type GeoPoint } from "./navigation";

export interface GpsPoint extends GeoPoint {
  at: number;
  accuracyM: number;
}

export type GpsTrust = "ready" | "reduced" | "wait";

export interface GpsReading {
  speedKph: number | null;
  trust: GpsTrust;
  line: string;
}

const READY = "Steady GPS speed from this phone. You can read it. It is not the vehicle speedometer.";
const REDUCED = "GPS accuracy reduced. You can still read it. It may jump a little.";
const WAIT = "GPS is not steady yet. A speed will appear when the fix settles.";
const WEAK = "GPS accuracy reduced. Don't read a speed yet.";

export function gpsSpeedReading(previous: GpsPoint | null, current: GpsPoint & { deviceSpeedMps: number | null }): GpsReading {
  if (!Number.isFinite(current.lat) || !Number.isFinite(current.lng) || !Number.isFinite(current.at)) {
    return { speedKph: null, trust: "wait", line: WEAK };
  }
  if (!Number.isFinite(current.accuracyM) || current.accuracyM < 0 || current.accuracyM > 100) {
    return { speedKph: null, trust: "wait", line: WEAK };
  }
  const device = current.deviceSpeedMps;
  if (device != null && Number.isFinite(device) && device >= 0 && device < 55) {
    const speedKph = Math.round(device * 3.6);
    if (speedKph > 160) return { speedKph: null, trust: "wait", line: WEAK };
    return finish(speedKph, current.accuracyM, false);
  }
  if (!previous || !Number.isFinite(previous.lat) || !Number.isFinite(previous.lng) || !Number.isFinite(previous.at)) {
    return { speedKph: null, trust: "wait", line: "Waiting for a second GPS fix." };
  }
  const seconds = (current.at - previous.at) / 1000;
  if (seconds < 0.8 || seconds > 15) return { speedKph: null, trust: "wait", line: WAIT };
  const metres = haversine(previous, current);
  const noise = Math.max(8, current.accuracyM * 0.4);
  if (metres < noise) {
    const implied = (metres / seconds) * 3.6;
    if (implied <= 5) return finish(0, current.accuracyM, true);
    return { speedKph: null, trust: "wait", line: WAIT };
  }
  const speedKph = Math.round((metres / seconds) * 3.6);
  if (speedKph > 160) return { speedKph: null, trust: "wait", line: WEAK };
  return finish(speedKph, current.accuracyM, true);
}

export function medianSpeed(history: number[], next: number | null): { history: number[]; speedKph: number | null } {
  if (next == null) return { history: [], speedKph: null };
  const kept = [...history, next].slice(-3);
  const sorted = [...kept].sort((a, b) => a - b);
  return { history: kept, speedKph: sorted[Math.floor((sorted.length - 1) / 2)] };
}

function finish(speedKph: number, accuracyM: number, derived: boolean): GpsReading {
  if (accuracyM <= 40) return { speedKph, trust: "ready", line: READY };
  if (!derived && accuracyM <= 100) return { speedKph, trust: "reduced", line: REDUCED };
  if (derived && speedKph === 0 && accuracyM <= 100) return { speedKph, trust: "reduced", line: REDUCED };
  if (derived && accuracyM <= 65) return { speedKph, trust: "reduced", line: REDUCED };
  return { speedKph: null, trust: "wait", line: WEAK };
}

export function parkedReading(accuracyM: number): GpsReading {
  if (!Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > 100) return { speedKph: null, trust: "wait", line: WEAK };
  return finish(0, accuracyM, true);
}
