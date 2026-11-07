import { describe, expect, it } from "vitest";
import { speedLimitProvider } from "./navigation";
import { DriverProtectionEngine, liveStatus } from "./protection";

describe("driver protection", () => {
  it("keeps an unverified limit unavailable", () => {
    const reading = speedLimitProvider.getCurrentLimit({
      at: "2026-11-06T20:00:00.000Z",
      location: { lat: 5.6, lng: -0.18 },
      declaredKph: null,
      mapped: null,
      demo: null,
    });
    expect(reading.kph).toBeNull();
    expect(reading.confidence).toBe("none");
    expect(speedLimitProvider.getLimitSource(reading)).toBe("unavailable");
    expect(speedLimitProvider.getLimitConfidence(reading)).toBe("none");
    expect(reading.note).toBe("Speed limit information unavailable");
    expect(speedLimitProvider.getUpcomingSpeedChange(null)).toBeNull();
  });

  it("uses four speed states and does not call 47 in a 50 limit unsafe", () => {
    expect(liveStatus(47, 50)).toBe("SAFE");
    expect(liveStatus(49, 50)).toBe("APPROACHING LIMIT");
    expect(liveStatus(62, 50)).toBe("ABOVE LIMIT");
    expect(liveStatus(40, null)).toBe("UNKNOWN");
    expect(liveStatus(null, 50)).toBe("UNKNOWN");
  });

  it("does not invent a road warning or a saved amount", () => {
    const engine = new DriverProtectionEngine({
      speedCompliance: 97,
      braking: 91,
      acceleration: 89,
      documentCompliance: 96,
      vehicleStanding: "good",
      activeViolations: 0,
      overdueViolations: 0,
      outstandingGhs: 0,
      expiredRequired: 0,
      focusTitle: "Roadworthiness expires in 27 days",
    });
    const score = engine.score();
    expect(score.value).toBe(97);
    expect(score.band).toBe("Excellent");
    expect(score.note).toMatch(/not the driver score/);
    const savings = engine.savings();
    expect(savings.lines).toContain("No missed renewals.");
    expect(savings.lines).toContain("No active violations.");
    expect(savings.amountGhs).toBeNull();
    expect(engine.awareness().some((fact) => /school|market|flood/i.test(fact.title))).toBe(false);
    const now = engine.now({ speedKph: 47, limitKph: 50, limitSource: "user_declared", upcoming: null });
    expect(now.headline).toMatch(/27 days/);
    expect(now.speech ?? "").not.toMatch(/school|traffic/i);
    const over = engine.now({ speedKph: 68, limitKph: 50, limitSource: "user_declared", upcoming: null });
    expect(over.speech).toMatch(/Reduce speed/);
    expect(over.speech).not.toMatch(/camera|avoid/i);
  });

  it("shows an open notice amount only when one is saved", () => {
    const engine = new DriverProtectionEngine({
      speedCompliance: null,
      braking: null,
      acceleration: null,
      documentCompliance: null,
      vehicleStanding: null,
      activeViolations: 1,
      overdueViolations: 0,
      outstandingGhs: 240,
      expiredRequired: 1,
      focusTitle: null,
    });
    expect(engine.score().value).toBeNull();
    expect(engine.savings().amountGhs).toBe(240);
    expect(engine.savings().amountNote).toMatch(/Not money already kept/);
    expect(engine.savings().lines[0]).toMatch(/past its date/);
  });
});
