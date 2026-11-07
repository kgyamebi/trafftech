import { describe, expect, it } from "vitest";
import { speedBoard } from "./companion";
import { gpsSpeedReading, medianSpeed, parkedReading, type GpsPoint } from "./gps-speed";
import { haversine } from "./navigation";
import { liveStatus } from "./protection";
import { SPEED_TOLERANCE_KPH, computeDriverScore, speedCompliance } from "./score";
import type { DrivingSessionRecord } from "./types";

const here: GpsPoint = { lat: 5.6037, lng: -0.187, at: 1_000, accuracyM: 10 };

function northOf(metres: number, seconds: number, accuracyM = 10): GpsPoint & { deviceSpeedMps: null } {
  const lat = here.lat + (metres / 6_371_000) * (180 / Math.PI);
  return { lat, lng: here.lng, at: here.at + seconds * 1000, accuracyM, deviceSpeedMps: null };
}

describe("gps speed matches the distance and the phone", () => {
  it.each([
    [0, 0],
    [5, 18],
    [10, 36],
    [12.5, 45],
    [15, 54],
    [20, 72],
    [25, 90],
    [30, 108],
    [40, 144],
    [44, 158],
    [44.5, 160],
  ])("converts %s m/s to %s km/h", (mps, kph) => {
    const reading = gpsSpeedReading(null, { ...here, deviceSpeedMps: mps });
    expect(reading.speedKph).toBe(kph);
    expect(reading.trust).toBe("ready");
  });

  it.each([
    [100, 10, 36],
    [50, 10, 18],
    [20, 2, 36],
    [250, 10, 90],
    [400, 10, 144],
  ])("derives %s metres in %s seconds as %s km/h", (metres, seconds, kph) => {
    const next = northOf(metres, seconds);
    const distance = haversine(here, next);
    expect(Math.abs(distance - metres)).toBeLessThan(0.01);
    const reading = gpsSpeedReading(here, next);
    expect(reading.speedKph).toBe(kph);
    expect(reading.trust).toBe("ready");
  });

  it("does not call a short move stopped", () => {
    const crawl = gpsSpeedReading(here, northOf(7, 1));
    expect(crawl.speedKph).toBeNull();
    expect(crawl.line).toMatch(/not steady/i);
    const parked = gpsSpeedReading(here, northOf(3, 10));
    expect(parked.speedKph).toBe(0);
    expect(parked.trust).toBe("ready");
  });

  it.each([
    [40, "ready"],
    [40.1, "reduced"],
    [65, "reduced"],
    [100, "reduced"],
  ] as const)("keeps a phone speed at %s metre accuracy as %s", (accuracyM, trust) => {
    const reading = gpsSpeedReading(null, { ...here, accuracyM, deviceSpeedMps: 10 });
    expect(reading.speedKph).toBe(36);
    expect(reading.trust).toBe(trust);
  });

  it.each([100.1, 140, -1, Number.NaN, Number.POSITIVE_INFINITY])("hides a phone speed at accuracy %s", (accuracyM) => {
    expect(gpsSpeedReading(null, { ...here, accuracyM, deviceSpeedMps: 10 }).speedKph).toBeNull();
  });

  it("hides a derived speed once the circle is wider than 65 metres", () => {
    const shown = gpsSpeedReading(here, northOf(100, 10, 65));
    const hidden = gpsSpeedReading(here, northOf(100, 10, 66));
    expect(shown.speedKph).toBe(36);
    expect(shown.trust).toBe("reduced");
    expect(hidden.speedKph).toBeNull();
  });

  it("hides impossible, stale, and broken readings", () => {
    expect(gpsSpeedReading(null, { ...here, deviceSpeedMps: 45 }).speedKph).toBeNull();
    expect(gpsSpeedReading(here, northOf(500, 10)).speedKph).toBeNull();
    expect(gpsSpeedReading(here, northOf(30, 0.5)).speedKph).toBeNull();
    expect(gpsSpeedReading(here, northOf(30, 16)).speedKph).toBeNull();
    expect(gpsSpeedReading(here, { ...northOf(30, 5), at: here.at - 5_000 }).speedKph).toBeNull();
    expect(gpsSpeedReading(null, { ...here, deviceSpeedMps: Number.NaN }).line).toMatch(/second GPS fix/);
    expect(gpsSpeedReading(null, { ...here, lat: Number.NaN, deviceSpeedMps: 10 }).speedKph).toBeNull();
    expect(gpsSpeedReading({ ...here, lat: Number.NaN }, northOf(100, 10)).line).toMatch(/second GPS fix/);
  });

  it("parks only inside a usable circle", () => {
    expect(parkedReading(12)).toMatchObject({ speedKph: 0, trust: "ready" });
    expect(parkedReading(40)).toMatchObject({ speedKph: 0, trust: "ready" });
    expect(parkedReading(80)).toMatchObject({ speedKph: 0, trust: "reduced" });
    expect(parkedReading(100)).toMatchObject({ speedKph: 0, trust: "reduced" });
    expect(parkedReading(100.1).speedKph).toBeNull();
    expect(parkedReading(-5).speedKph).toBeNull();
  });

  it.each([
    [[40], 40],
    [[40, 80], 40],
    [[46, 90, 48], 48],
    [[10, 12, 11], 11],
    [[70, 71, 72], 71],
  ])("median %j is %s", (values, shown) => {
    let history: number[] = [];
    let speed: number | null = null;
    for (const value of values) {
      const step = medianSpeed(history, value);
      history = step.history;
      speed = step.speedKph;
    }
    expect(speed).toBe(shown);
    expect(medianSpeed(history, null)).toEqual({ history: [], speedKph: null });
  });
});

describe("limit status is exact at every kilometre", () => {
  it.each([30, 50, 90, 100])("classifies every speed around a %s limit", (limit) => {
    expect(liveStatus(null, limit)).toBe("UNKNOWN");
    expect(liveStatus(0, null)).toBe("UNKNOWN");
    for (let speed = 0; speed <= limit + 30; speed += 1) {
      const status = liveStatus(speed, limit);
      if (speed > limit + 1) expect(status).toBe("ABOVE LIMIT");
      else if (speed >= limit - 1) expect(status).toBe("APPROACHING LIMIT");
      else expect(status).toBe("SAFE");
    }
  });

  it("matches the board to the same four states", () => {
    const cases = [
      [47, "SAFE"],
      [49, "APPROACHING LIMIT"],
      [51, "APPROACHING LIMIT"],
      [52, "ABOVE LIMIT"],
    ] as const;
    for (const [speed, status] of cases) {
      const board = speedBoard({ source: "gps", speedKph: speed, accuracyM: 12, limitKph: 50, limitOrigin: "user_declared" });
      expect(board.speed).toBe(speed);
      expect(board.status).toBe(status);
      expect(board.status).toBe(liveStatus(speed, 50));
    }
    const stopped = speedBoard({ source: "gps", speedKph: 0, accuracyM: 12, limitKph: 50, limitOrigin: "user_declared" });
    expect(stopped.speed).toBe(0);
    expect(stopped.status).toBe("SAFE");
  });
});

describe("driver score arithmetic", () => {
  const now = new Date("2026-11-06T12:00:00.000Z");

  function session(samples: { speedKph: number; limitKph: number }[], brakes = 0, accels = 0): DrivingSessionRecord {
    return {
      id: "s",
      userId: "u",
      vehicleId: "v",
      driverId: null,
      startedAt: "2026-11-06T10:00:00.000Z",
      endedAt: "2026-11-06T10:40:00.000Z",
      roadContext: "urban",
      samples: samples.map((sample, index) => ({ ...sample, t: new Date(now.getTime() - index * 1000).toISOString() })),
      harshBrakes: brakes,
      harshAccelerations: accels,
      simulated: false,
      source: "CALCULATED",
      dataClass: "REAL",
    };
  }

  it("counts a sample as over only past the one kilometre tolerance", () => {
    const samples = [
      ...Array.from({ length: 18 }, () => ({ speedKph: 50, limitKph: 50 })),
      { speedKph: 51, limitKph: 50 },
      { speedKph: 52, limitKph: 50 },
    ];
    expect(SPEED_TOLERANCE_KPH).toBe(1);
    expect(speedCompliance(samples)).toBe(95);
  });

  it("scores a clean 40 minute trip at 100 and one over-limit sample at 99", () => {
    const clean = Array.from({ length: 20 }, () => ({ speedKph: 48, limitKph: 50 }));
    const perfect = computeDriverScore({ sessions: [session(clean)], violations: [], now, window: "month" });
    expect(perfect.overall).toBe(100);
    expect(perfect.components).toMatchObject({ speed: 100, braking: 100, acceleration: 100, traffic: 100, consistency: 100 });
    const mixed = [...clean.slice(0, 19), { speedKph: 60, limitKph: 50 }];
    const scored = computeDriverScore({ sessions: [session(mixed)], violations: [], now, window: "month" });
    expect(scored.components?.speed).toBe(95);
    expect(scored.overall).toBe(Math.round(95 * 0.3 + 100 * 0.2 + 100 * 0.2 + 100 * 0.15 + scored.components!.consistency * 0.15));
  });

  it("leaves a simulated trip and a fleet trip out of the score", () => {
    const samples = Array.from({ length: 20 }, () => ({ speedKph: 48, limitKph: 50 }));
    const simulated = { ...session(samples), simulated: true };
    const fleet = { ...session(samples), driverId: "other" };
    const score = computeDriverScore({ sessions: [simulated, fleet], violations: [], now, window: "month" });
    expect(score.status).toBe("insufficient");
    expect(score.overall).toBeNull();
  });
});
