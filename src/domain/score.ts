import { clamp, inWindow, minutesBetween, windowStart } from "./dates";
import type { DrivingSessionRecord, ScoreComponents, ScoreView, ScoreWindow, ViolationRecord } from "./types";

export const MIN_SAMPLES = 20;
export const MIN_MINUTES = 30;
export const SPEED_TOLERANCE_KPH = 1;
export const BRAKE_PENALTY = 3;
export const ACCEL_PENALTY = 5.5;
export const VIOLATION_PENALTY = 15;
export const CONSISTENCY_SCALE = 119;

const WEIGHTS = {
  speed: 0.3,
  braking: 0.2,
  acceleration: 0.2,
  traffic: 0.15,
  consistency: 0.15,
};

export function scoreBand(overall: number): string {
  if (overall >= 90) return "Excellent";
  if (overall >= 80) return "Strong";
  if (overall >= 70) return "Steady";
  if (overall >= 55) return "Uneven";
  return "At risk";
}

export function speedCompliance(samples: { speedKph: number; limitKph: number }[]): number | null {
  if (samples.length === 0) return null;
  const over = samples.filter((s) => s.speedKph > s.limitKph + SPEED_TOLERANCE_KPH).length;
  return Math.round((1 - over / samples.length) * 100);
}

export function consistencyScore(samples: { speedKph: number }[]): number | null {
  if (samples.length < 2) return null;
  const mean = samples.reduce((a, s) => a + s.speedKph, 0) / samples.length;
  if (mean <= 0) return null;
  const variance = samples.reduce((a, s) => a + (s.speedKph - mean) ** 2, 0) / samples.length;
  const cv = Math.sqrt(variance) / mean;
  return clamp(Math.round(100 - cv * CONSISTENCY_SCALE), 0, 100);
}

function violationCounts(violations: ViolationRecord[]): boolean {
  return violations.length > 0;
}

export function computeDriverScore(input: {
  sessions: DrivingSessionRecord[];
  violations: ViolationRecord[];
  now: Date;
  window: ScoreWindow;
  driverId?: string | null;
  source?: "CALCULATED" | "DEMO";
}): ScoreView {
  const driverId = input.driverId ?? null;
  const start = windowStart(input.now, input.window);
  const sessions = input.sessions.filter(
    (s) => (s.driverId ?? null) === driverId && inWindow(s.endedAt, start, input.now) && !s.simulated,
  );
  const samples = sessions.flatMap((s) => s.samples);
  const minutes = Math.round(sessions.reduce((a, s) => a + minutesBetween(s.startedAt, s.endedAt), 0));
  const base = {
    window: input.window,
    samples: samples.length,
    minutes,
    requiredSamples: MIN_SAMPLES,
    requiredMinutes: MIN_MINUTES,
    source: input.source ?? "CALCULATED",
    sessionsInWindow: sessions.length,
  };

  if (samples.length < MIN_SAMPLES || minutes < MIN_MINUTES) {
    return {
      ...base,
      status: "insufficient",
      overall: null,
      band: null,
      components: null,
      note: "Not enough driving data yet. Practice routes are not saved.",
    };
  }

  const speed = speedCompliance(samples) ?? 0;
  const brakes = sessions.reduce((a, s) => a + s.harshBrakes, 0);
  const accels = sessions.reduce((a, s) => a + s.harshAccelerations, 0);
  const braking = clamp(Math.round(100 - brakes * BRAKE_PENALTY), 0, 100);
  const acceleration = clamp(Math.round(100 - accels * ACCEL_PENALTY), 0, 100);
  const inScope = input.violations.filter((v) => inWindow(v.occurredAt, start, input.now));
  const traffic = clamp(100 - (violationCounts(inScope) ? inScope.length * VIOLATION_PENALTY : 0), 0, 100);
  const consistency = consistencyScore(samples) ?? 0;
  const components: ScoreComponents = { speed, braking, acceleration, traffic, consistency };
  const overall = Math.round(
    components.speed * WEIGHTS.speed +
      components.braking * WEIGHTS.braking +
      components.acceleration * WEIGHTS.acceleration +
      components.traffic * WEIGHTS.traffic +
      components.consistency * WEIGHTS.consistency,
  );

  return {
    ...base,
    status: "ready",
    overall,
    band: scoreBand(overall),
    components,
    note: "Calculated from driving you recorded in Nokware and violations saved in your account. It is not an official record.",
  };
}

export function allWindows(
  input: Omit<Parameters<typeof computeDriverScore>[0], "window">,
): Record<ScoreWindow, ScoreView> {
  return {
    today: computeDriverScore({ ...input, window: "today" }),
    week: computeDriverScore({ ...input, window: "week" }),
    month: computeDriverScore({ ...input, window: "month" }),
    "6months": computeDriverScore({ ...input, window: "6months" }),
  };
}
