import { describe, expect, it } from "vitest";
import {
  DemoLocationPlayer,
  buildDemoFrames,
  chooseAlert,
  closingLine,
  countHarsh,
  decimate,
  destinationAllowed,
  filterTrips,
  locationMessage,
  lookAhead,
  maneuverText,
  mapFailureMessage,
  movementStatus,
  nextInstruction,
  parseNominatim,
  parseOsrm,
  progressAlong,
  rankRoutes,
  readReverse,
  rerouteDecision,
  steadyPosition,
  roadNotesFor,
  shouldSpeak,
  speedLimitProvider,
  summariseScript,
  tripComparison,
  type NavAlert,
} from "./navigation";

describe("map camera", () => {
  it("places the close view ahead of the driver and leaves a stopped view where it is", () => {
    const here = { lat: 5.6, lng: -0.2 };
    const north = lookAhead(here, 0, 1_113.2);
    expect(north.lat).toBeCloseTo(5.61, 3);
    expect(north.lng).toBeCloseTo(-0.2, 3);
    const east = lookAhead(here, 90, 1_113.2);
    expect(east.lng).toBeGreaterThan(here.lng);
    expect(east.lat).toBeCloseTo(here.lat, 3);
    expect(lookAhead(here, 180, 0)).toEqual(here);
  });
});

describe("navigation", () => {
  it("refuses enforcement-avoidance searches and ranks only by time then distance", () => {
    expect(destinationAllowed("Kotoka International Airport").ok).toBe(true);
    expect(destinationAllowed("avoid police cameras").ok).toBe(false);
    const ranked = rankRoutes([
      { id: "slow", durationS: 900, distanceM: 1000, avoidEnforcement: false },
      { id: "fast", durationS: 700, distanceM: 4000, avoidEnforcement: true },
      { id: "tie", durationS: 700, distanceM: 3000 },
    ]);
    expect(ranked.map((route) => route.id)).toEqual(["tie", "fast", "slow"]);
  });

  it("does not invent a speed limit from a coordinate", () => {
    const reading = speedLimitProvider.getApplicableSpeedLimit({
      at: "2026-11-06T12:00:00.000Z",
      location: { lat: 5.6, lng: -0.17 },
      declaredKph: null,
      mapped: null,
      demo: null,
    });
    expect(reading.kph).toBeNull();
    expect(reading.note).toBe("Speed limit information unavailable");
    expect(reading.confidence).toBe("none");
    expect(speedLimitProvider.getUpcomingSpeedLimitChanges(null)).toBeNull();
    const declared = speedLimitProvider.getApplicableSpeedLimit({
      at: "2026-11-06T12:00:00.000Z",
      location: { lat: 5.6, lng: -0.17 },
      declaredKph: 50,
      mapped: null,
      demo: null,
    });
    expect(declared.source).toBe("user_declared");
    expect(declared.confidence).toBe("low");
    expect(declared.note.toLowerCase()).not.toContain("official");
    const mapped = speedLimitProvider.getApplicableSpeedLimit({
      at: "2026-11-06T12:00:00.000Z",
      location: { lat: 5.6, lng: -0.17 },
      declaredKph: null,
      mapped: { kph: 50, road: "Liberation Road" },
      demo: null,
    });
    expect(mapped.source).toBe("openstreetmap");
    expect(mapped.kph).toBe(50);
    expect(mapped.note).toMatch(/OpenStreetMap/);
    expect(mapped.note).toMatch(/not an official feed/i);
    expect(mapped.note).toMatch(/posted sign controls/);
  });

  it("plays the Airport City demonstration without claiming live data", () => {
    const frames = buildDemoFrames();
    const player = new DemoLocationPlayer(frames);
    expect(player.current().speedKph).toBe(42);
    expect(player.current().limit.kph).toBe(50);
    expect(player.current().limit.source).toBe("demo_script");
    const ahead = frames.find((frame) => frame.alert?.title === "LIMIT 30 AHEAD");
    expect(ahead?.upcoming?.metres).toBe(300);
    expect(ahead?.limit.kph).toBe(50);
    const now = frames.find((frame) => frame.alert?.title === "LIMIT NOW 30 km/h");
    expect(now?.limit.kph).toBe(30);
    const reroute = frames.find((frame) => frame.alert?.title === "New route");
    expect(reroute?.fadedGeometry).not.toBeNull();
    expect(frames[frames.length - 1].arrived).toBe(true);
    expect(frames[frames.length - 1].instruction?.text).toBe("Arrive");
    expect(frames.some((frame) => /live traffic/i.test(frame.alert?.title ?? ""))).toBe(false);
    expect(frames.some((frame) => frame.limit.note.toLowerCase().includes("official"))).toBe(false);
    expect(frames.some((frame) => frame.alert?.detail.toLowerCase().includes("not live"))).toBe(true);
    expect(roadNotesFor(ahead?.alert ?? null)[0]?.source).toBe("demo_script");
    expect(roadNotesFor(null)).toEqual([]);
    player.advance();
    expect(player.current().index).toBe(1);
    const summary = summariseScript(frames);
    expect(summary.compliance).not.toBeNull();
    expect(summary.distanceM).toBeGreaterThan(1000);
    expect(closingLine({ demo: true, compliance: summary.compliance, harshBrakes: 0 })).toMatch(/not saved/i);
  });

  it("follows a route, reroutes only after a real deviation, and completes a trip", () => {
    const line = [
      { lat: 5.6, lng: -0.2 },
      { lat: 5.61, lng: -0.19 },
      { lat: 5.62, lng: -0.18 },
    ];
    const start = progressAlong(line[0], line);
    expect(start.offRouteM).toBeLessThan(5);
    expect(start.remainingM).toBeGreaterThan(start.traveledM);
    const off = progressAlong({ lat: 5.6, lng: -0.16 }, line);
    expect(off.offRouteM).toBeGreaterThan(60);
    expect(rerouteDecision({ offRouteM: 40, consecutive: 3, mode: "auto" })).toBe("none");
    expect(rerouteDecision({ offRouteM: 80, consecutive: 1, mode: "auto" })).toBe("none");
    expect(rerouteDecision({ offRouteM: 80, consecutive: 2, mode: "auto" })).toBe("auto");
    expect(rerouteDecision({ offRouteM: 80, consecutive: 2, mode: "ask" })).toBe("ask");
    expect(rerouteDecision({ offRouteM: 80, consecutive: 2, mode: "auto", accuracyM: 80 })).toBe("none");
    expect(rerouteDecision({ offRouteM: 130, consecutive: 2, mode: "auto", accuracyM: 80 })).toBe("none");
    expect(rerouteDecision({ offRouteM: 130, consecutive: 3, mode: "auto", accuracyM: 80 })).toBe("auto");
    expect(start.snapped.lat).toBeCloseTo(line[0].lat, 4);
    expect(off.bearing).toBeGreaterThan(0);
    expect(movementStatus(47, null)).toBe("UNKNOWN");
    expect(movementStatus(47, 50)).toBe("SAFE");
    expect(movementStatus(62, 50)).toBe("OVER");
    const steps = [
      { kind: "depart", text: "Head out", distanceFromStartM: 0, at: line[0] },
      { kind: "turn", text: "Turn right", distanceFromStartM: 400, at: line[1] },
      { kind: "arrive", text: "Arrive", distanceFromStartM: 1200, at: line[2] },
    ];
    expect(nextInstruction(100, steps)?.text).toBe("Turn right");
    expect(nextInstruction(100, steps)?.metres).toBe(300);
    const critical: NavAlert = { id: "b", level: "critical", title: "Route blocked", detail: "The road ahead is closed.", source: "route" };
    const info: NavAlert = { id: "i", level: "information", title: "Note", detail: "Later.", source: "route" };
    expect(chooseAlert([info, critical])?.id).toBe("b");
    expect(shouldSpeak("important", "information")).toBe(false);
    expect(shouldSpeak("important", "guidance")).toBe(false);
    expect(shouldSpeak("important", "warning")).toBe(true);
    expect(shouldSpeak("navigation", "guidance")).toBe(true);
    expect(shouldSpeak("navigation", "warning")).toBe(false);
    expect(shouldSpeak("off", "guidance")).toBe(false);
    expect(countHarsh([{ speedKph: 50 }, { speedKph: 20 }, { speedKph: 45 }])).toEqual({ brakes: 1, accels: 1 });
    expect(decimate(line, 2)).toHaveLength(2);
    expect(tripComparison(90, null)).toBeNull();
    expect(tripComparison(96, 88)).toMatch(/higher/);
    const now = new Date("2026-11-06T12:00:00.000Z");
    const trips = [
      { endedAt: "2026-11-06T08:00:00.000Z" },
      { endedAt: "2026-11-01T08:00:00.000Z" },
      { endedAt: "2026-09-01T08:00:00.000Z" },
    ];
    expect(filterTrips(trips, "today", now)).toHaveLength(1);
    expect(filterTrips(trips, "week", now)).toHaveLength(2);
    expect(filterTrips(trips, "custom", now, { from: "2026-09-01", to: "2026-09-02" })).toHaveLength(1);
    expect(locationMessage("denied")).toMatch(/Location is off/);
    expect(mapFailureMessage("down").title).toBe("Maps are temporarily unavailable.");
    expect(closingLine({ demo: false, compliance: null, harshBrakes: 0 })).toMatch(/does not change your score/);
  });

  it("keeps progress on the current stretch and drops an impossible GPS jump", () => {
    const line = [
      { lat: 5.6, lng: -0.2 },
      { lat: 5.605, lng: -0.2 },
      { lat: 5.605, lng: -0.2004 },
      { lat: 5.6, lng: -0.2004 },
    ];
    const besideReturn = { lat: 5.601, lng: -0.20031 };
    const held = progressAlong(besideReturn, line, 80);
    const nearest = progressAlong(besideReturn, line);
    expect(nearest.traveledM).toBeGreaterThan(600);
    expect(held.traveledM).toBeLessThan(400);
    const onTheWayBack = { lat: 5.601, lng: -0.20038 };
    const caughtUp = progressAlong(onTheWayBack, line, 80);
    expect(caughtUp.traveledM).toBeGreaterThan(600);
    expect(caughtUp.offRouteM).toBeLessThan(20);
    const here = { lat: 5.6, lng: -0.2, at: 1_000 };
    const spike = steadyPosition(here, { lat: 5.6045, lng: -0.2, at: 2_000 });
    expect(spike).toEqual({ lat: here.lat, lng: here.lng });
    const nudge = steadyPosition(here, { lat: 5.60009, lng: -0.2, at: 2_000 });
    expect(nudge.lat).toBeGreaterThan(here.lat);
    expect(nudge.lat).toBeLessThan(5.60009);
  });

  it("parses provider payloads without inventing traffic", () => {
    const parsed = parseOsrm({
      code: "Ok",
      routes: [
        {
          distance: 5000,
          duration: 900,
          geometry: { coordinates: [[-0.17, 5.6], [-0.15, 5.63]] },
          legs: [{ steps: [
            { distance: 2000, name: "Liberation Rd", maneuver: { type: "depart", modifier: "straight", location: [-0.17, 5.6] } },
            { distance: 3000, name: "Boundary Rd", maneuver: { type: "turn", modifier: "right", location: [-0.16, 5.61] } },
          ] }],
        },
        {
          distance: 4200,
          duration: 700,
          geometry: { coordinates: [[-0.17, 5.6], [-0.16, 5.62], [-0.15, 5.63]] },
          legs: [{ steps: [{ distance: 4200, name: "", maneuver: { type: "off ramp", modifier: "right", location: [-0.17, 5.6] } }] }],
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.routes[0].label).toBe("Recommended");
    expect(parsed.routes[0].durationS).toBe(700);
    expect(parsed.routes[0].trafficAvailable).toBe(false);
    expect(parsed.routes[0].trafficNote.toLowerCase()).not.toContain("live");
    expect(parsed.routes[0].steps[0].text).toBe("Exit right");
    expect(parsed.routes[1].steps[1].text).toBe("Turn right onto Boundary Rd");
    expect(parseOsrm({ code: "NoRoute" }).ok).toBe(false);
    const places = parseNominatim([
      { place_id: 9, name: "Kotoka International Airport", display_name: "Kotoka International Airport, Accra, Ghana", lat: "5.605", lon: "-0.166" },
      { lat: "nope", lon: "0" },
    ]);
    expect(places).toHaveLength(1);
    expect(places[0].name).toBe("Kotoka International Airport");
    expect(maneuverText("arrive", undefined, "")).toBe("Arrive");
  });

  it("names a tapped place only when OpenStreetMap's object is actually there", () => {
    const here = { lat: 5.6, lng: -0.2 };
    const hospital = readReverse({
      name: "37 Military Hospital",
      lat: "5.6001",
      lon: "-0.2001",
      category: "amenity",
      type: "hospital",
      address: { road: "Hospital Link", suburb: "Kanda", city: "Accra" },
      extratags: { phone: "+233 30 277 7695", website: "https://example.com", opening_hours: "Mo-Fr 08:00-17:00", maxspeed: "50" },
    }, here);
    expect(hospital.name).toBe("37 Military Hospital");
    expect(hospital.kind).toBe("Hospital");
    expect(hospital.phone).toBe("+233 30 277 7695");
    expect(hospital.website).toBe("https://example.com");
    expect(hospital.hours).toBe("Mo-Fr 08:00-17:00");
    expect(hospital.maxspeed).toBeNull();
    expect(hospital.address).toMatch(/Hospital Link/);
    const road = readReverse({
      name: "Liberation Road",
      lat: "5.6002",
      lon: "-0.2001",
      category: "highway",
      type: "primary",
      address: { road: "Liberation Road", city: "Accra" },
      extratags: { maxspeed: "50", website: "javascript:alert(1)" },
    }, here);
    expect(road.name).toBe("Liberation Road");
    expect(road.kind).toBe("Road");
    expect(road.maxspeed).toBe("50");
    expect(road.website).toBeNull();
    const far = readReverse({
      name: "A hospital far away",
      lat: "5.62",
      lon: "-0.2",
      category: "amenity",
      type: "hospital",
      address: { suburb: "Cantonments", city: "Accra" },
      extratags: { phone: "+233 30 277 7695", maxspeed: "50", opening_hours: "<script>" },
    }, here);
    expect(far.name).toBe("Dropped pin");
    expect(far.kind).toBeNull();
    expect(far.phone).toBeNull();
    expect(far.maxspeed).toBeNull();
    expect(far.hours).toBeNull();
    expect(far.area).toMatch(/Accra/);
    const onARoad = readReverse({
      name: "A junction far along the road",
      lat: "5.62",
      lon: "-0.2",
      category: "highway",
      type: "residential",
      address: { road: "Patrice Lumumba Road", suburb: "Airport Residential Area", city: "Accra" },
      extratags: { maxspeed: "50" },
    }, here);
    expect(onARoad.name).toBe("Patrice Lumumba Road");
    expect(onARoad.maxspeed).toBeNull();
    expect(onARoad.address).toMatch(/Airport Residential Area/);
    expect(readReverse(null, here).name).toBe("Dropped pin");
  });
});
