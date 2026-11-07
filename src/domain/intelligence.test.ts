import { describe, expect, it } from "vitest";
import { DriverIntelligenceEngine, driverHealth, driverStatusChip, fleetHealth, oneUpcoming, openingCard, roadFacts, tripQuality } from "./intelligence";
import { DemoTraffic, GoogleProvider, MapboxProvider, TomTomProvider } from "./services";
import { demoCapabilities, openCapabilities, providerStack, unsupportedNotes, vendorCapabilities } from "./providers";
import type { IntelligenceContext } from "./intelligence";

function context(patch: Partial<IntelligenceContext> = {}): IntelligenceContext {
  return {
    mode: "user",
    heroState: "ready",
    heroTitle: "You're ready to drive.",
    attention: [],
    scoreStatus: "insufficient",
    scoreOverall: null,
    scoreNote: "Not enough driving data yet.",
    components: null,
    ...patch,
  };
}

describe("driver intelligence", () => {
  it("answers readiness from records already on the account", () => {
    expect(new DriverIntelligenceEngine(context()).readiness().state).toBe("READY");
    const blocked = new DriverIntelligenceEngine(context({
      heroState: "urgent",
      heroTitle: "Insurance has expired.",
      attention: [{
        title: "Insurance has expired.",
        detail: "The date you entered is past.",
        href: "/vehicle",
        severity: "urgent",
        source: "USER_PROVIDED",
        recommendedAction: "Renew it, then update the date.",
      }],
    })).readiness();
    expect(blocked.state).toBe("ATTENTION REQUIRED");
    expect(blocked.actions[0].source).toBe("USER_PROVIDED");
    expect(blocked.actions[0].detail).toMatch(/Renew/);
    expect(new DriverIntelligenceEngine(context({ heroState: "setup", heroTitle: "Add a vehicle to begin." })).readiness().state).toBe("SETUP");
  });

  it("scores a trip only from samples and does not invent road context", () => {
    const engine = new DriverIntelligenceEngine(context());
    const empty = engine.assessTrip({
      demo: false,
      minutes: 4,
      samples: 0,
      compliance: null,
      harshBrakes: 0,
      harshAccels: 0,
      events: [],
    }, "Traffic is not available from this provider.");
    expect(empty.quality).toBeNull();
    expect(empty.improvements).toEqual([]);
    expect(empty.scoreImpact).toMatch(/does not change your driver score/);
    expect(empty.trafficSummary.toLowerCase()).not.toContain("live traffic");

    const over = engine.assessTrip({
      demo: false,
      minutes: 6,
      samples: 8,
      compliance: 70,
      harshBrakes: 1,
      harshAccels: 0,
      events: [],
    }, "Traffic is not available from this provider.");
    expect(over.compliance).toBe(70);
    expect(over.quality).toBe(tripQuality({ demo: false, minutes: 6, samples: 8, compliance: 70, harshBrakes: 1, harshAccels: 0, events: [] }));
    expect(over.improvements.join(" ")).toMatch(/limit in use/);
    expect(over.scoreImpact).toMatch(/20 speed samples/);
    expect(over.source).toBe("CALCULATED");

    const demo = engine.assessTrip({
      demo: true,
      minutes: 8,
      samples: 24,
      compliance: 92,
      harshBrakes: 0,
      harshAccels: 0,
      events: [],
    }, "Demonstration congestion is scripted.");
    expect(demo.source).toBe("DEMO");
    expect(demo.scoreImpact).toMatch(/does not change/);
    expect(roadFacts(null, "2026-11-06T12:00:00.000Z")).toEqual([]);
    expect(roadFacts({
      id: "congestion",
      level: "important",
      title: "Heavy congestion ahead",
      detail: "Scripted for this demonstration. This is not live traffic.",
      source: "demo_script",
    }, "demo").map((fact) => fact.confidence)).toEqual(["scripted"]);
    expect(JSON.stringify(roadFacts(null, "now")).toLowerCase()).not.toContain("school");
  });

  it("coaches from calculated components and stays quiet without history", () => {
    expect(new DriverIntelligenceEngine(context()).coaching()).toEqual(["Not enough driving history."]);
    const line = new DriverIntelligenceEngine(context({
      scoreStatus: "ready",
      scoreOverall: 82,
      components: { speed: 96, braking: 61, acceleration: 90, traffic: 100, consistency: 88 },
    })).coaching()[0];
    expect(line).toMatch(/Smooth braking/);
    expect(line).toMatch(/61/);
    expect(new DriverIntelligenceEngine(context({ scoreStatus: "ready", scoreOverall: 90, components: { speed: 90, braking: 90, acceleration: 90, traffic: 90, consistency: 90 } })).trend(84)).toMatch(/6 points higher/);
    expect(new DriverIntelligenceEngine(context()).trend(80)).toBeNull();
    const factors = new DriverIntelligenceEngine(context({
      scoreStatus: "ready",
      scoreOverall: 82,
      components: { speed: 96, braking: 61, acceleration: 90, traffic: 100, consistency: 88 },
    })).scoreFactors();
    expect(factors.find((factor) => factor.label === "Attention events")).toEqual({ label: "Attention events", value: null, note: "Not recorded." });
    expect(factors.find((factor) => factor.label === "Driving efficiency")?.value).toBeNull();
    expect(factors.find((factor) => factor.label === "Smooth braking")?.value).toBe(61);
    expect(driverStatusChip({
      heroState: "ready",
      heroTitle: "Ready",
      vehicle: { id: "car", standingLabel: "Good standing" },
      focus: { title: "Insurance expires in 9 days", href: "/documents" },
    })).toEqual({ label: "READY TO DRIVE", message: "Everything looks good.", href: "/vehicle/car", action: "Vehicle" });
    expect(driverStatusChip({
      heroState: "attention",
      heroTitle: "Insurance expires in 6 days.",
      vehicle: { id: "car", standingLabel: "Needs attention" },
      focus: { title: "Insurance expires in 6 days.", href: "/documents" },
    }).label).toBe("ACTION REQUIRED");
    const health = driverHealth({ driverScore: 94, vehicleCompliance: 96, openObligations: 0 });
    expect(health.overall).toBe(95);
    expect(health.band).toBe("Excellent");
    expect(health.factors.find((factor) => factor.label === "Cornering")?.note).toBe("Not recorded.");
    expect(driverHealth({ driverScore: null, vehicleCompliance: null, openObligations: 1 }).note).toBe("Not enough records.");
    expect(fleetHealth([null, null]).overall).toBeNull();
    expect(fleetHealth([80, 90]).overall).toBe(85);
    const clear = openingCard({
      heroState: "ready",
      heroTitle: "You're ready to drive.",
      greeting: "Good morning, Ama",
      vehicle: { id: "car", standing: "good" },
      documents: [
        { kind: "insurance", status: "valid", vehicleId: "car" },
        { kind: "roadworthiness", status: "valid", vehicleId: "car" },
      ],
      activeViolations: 0,
      score: 94,
      focus: null,
      demo: false,
    });
    expect(clear.message).toBe("Good morning, Ama. You're ready to drive.");
    expect(clear.checks?.map((check) => check.label)).toEqual(["Vehicle good", "Insurance valid", "Roadworthiness valid", "No active violations"]);
    expect(clear.score).toBe(94);
    const expiring = openingCard({
      ...{
        heroState: "ready" as const,
        heroTitle: "You're ready to drive.",
        greeting: "Good morning, Ama",
        vehicle: { id: "car", standing: "good" },
        documents: [
          { kind: "insurance", status: "valid", vehicleId: "car" },
          { kind: "roadworthiness", status: "expiring", vehicleId: "car" },
        ],
        activeViolations: 0,
        score: 94,
        focus: { title: "Roadworthiness expires in 27 days", href: "/documents" },
        demo: true,
      },
    });
    expect(expiring.checks).toBeNull();
    expect(expiring.message).toBe("Roadworthiness expires in 27 days");
    expect(expiring.score).toBeNull();
    expect(expiring.action).toBe("See the date");
    expect(driverStatusChip({
      heroState: "urgent",
      heroTitle: "A notice needs you",
      vehicle: null,
      focus: { title: "Traffic violation requires review", href: "/traffic/1" },
    }).message).toBe("Traffic violation requires review");
    expect(oneUpcoming(
      [
        { title: "First", href: "/a", severity: "urgent" },
        { title: "Second", href: "/b", severity: "urgent" },
      ],
      "Consistency improved",
    )).toEqual({ title: "First", href: "/a" });
  });

  it("keeps map vendors as infrastructure and does not pretend they are connected", async () => {
    const open = openCapabilities();
    expect(open.navigation.lanes).toBe(false);
    expect(open.traffic.live).toBe(false);
    expect(open.speedLimits.verified).toBe(false);
    expect(open.road.live).toBe(false);
    expect(open.map.offline).toBe(false);
    expect(unsupportedNotes(open).join(" ")).toMatch(/Lane guidance/);
    const mapbox = vendorCapabilities("mapbox", undefined);
    expect(mapbox.configured).toBe(false);
    expect(mapbox.sourceLabel).toBe("Not connected");
    expect(vendorCapabilities("tomtom", "present").configured).toBe(false);
    expect(demoCapabilities().sourceLabel).toBe("DEMO");
    expect(demoCapabilities().traffic.live).toBe(false);
    const stack = providerStack({ map: "off" });
    expect(stack.find((item) => item.id === "open")?.configured).toBe(false);
    expect(stack.find((item) => item.id === "google")?.traffic.live).toBe(false);
    const dormant = new MapboxProvider();
    expect(dormant.road.lookup("2026-11-06T12:00:00.000Z")).toEqual([]);
    expect(dormant.traffic.live).toBe(false);
    expect(dormant.navigation.lanes).toBe(false);
    await expect(dormant.search.searchPlaces("Kotoka")).resolves.toMatchObject({ ok: false });
    expect(new TomTomProvider().traffic.describe().sourceLabel).toBe("Not connected");
    expect(new GoogleProvider().map.render).toBe(false);
    expect(new DemoTraffic().describe().note.toLowerCase()).not.toContain("live traffic is");
    expect(new DemoTraffic().live).toBe(false);
  });
});
