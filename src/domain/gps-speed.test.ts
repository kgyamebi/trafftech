import { describe, expect, it } from "vitest";
import { gpsSpeedReading, medianSpeed } from "./gps-speed";

const here = { lat: 5.6037, lng: -0.187, at: 1_000, accuracyM: 10 };

describe("gps speed a driver can read", () => {
  it("uses the phone speed when the fix is steady", () => {
    const reading = gpsSpeedReading(null, { ...here, deviceSpeedMps: 13.2 });
    expect(reading.speedKph).toBe(48);
    expect(reading.trust).toBe("ready");
    expect(reading.line).toMatch(/You can read it/);
    expect(reading.line).toMatch(/not the vehicle speedometer/i);
  });

  it("still shows a phone speed when the circle is a normal city fix", () => {
    const reading = gpsSpeedReading(null, { ...here, accuracyM: 55, deviceSpeedMps: 13.2 });
    expect(reading.speedKph).toBe(48);
    expect(reading.trust).toBe("reduced");
    expect(reading.line).toMatch(/may jump/);
  });

  it("derives speed from two steady fixes when the phone omits speed", () => {
    const next = { lat: 5.6046, lng: -0.187, at: 11_000, accuracyM: 12, deviceSpeedMps: null };
    const reading = gpsSpeedReading(here, next);
    expect(reading.trust).toBe("ready");
    expect(reading.speedKph).toBeGreaterThan(20);
    expect(reading.speedKph).toBeLessThan(50);
  });

  it("hides a speed when the fix is weak or the jump is impossible", () => {
    expect(gpsSpeedReading(null, { ...here, accuracyM: 140, deviceSpeedMps: 10 }).speedKph).toBeNull();
    const jump = gpsSpeedReading(here, { lat: 5.65, lng: -0.187, at: 3_000, accuracyM: 10, deviceSpeedMps: null });
    expect(jump.speedKph).toBeNull();
    expect(jump.line).toMatch(/Don't read a speed/);
  });

  it("reads zero when the phone has barely moved and the fix is steady", () => {
    const reading = gpsSpeedReading(here, { ...here, at: 4_000, deviceSpeedMps: null });
    expect(reading.speedKph).toBe(0);
    expect(reading.trust).toBe("ready");
  });

  it("smooths flicker and drops a single spike", () => {
    let history: number[] = [];
    for (const next of [46, 90, 48]) {
      const step = medianSpeed(history, next);
      history = step.history;
    }
    expect(history.length).toBe(3);
    expect(medianSpeed(history, null).speedKph).toBeNull();
    const shown = medianSpeed([], 46);
    shown.history = medianSpeed(shown.history, 90).history;
    expect(medianSpeed(shown.history, 48).speedKph).toBe(48);
  });
});
