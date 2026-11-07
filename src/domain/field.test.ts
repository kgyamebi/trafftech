import { describe, expect, it } from "vitest";
import { emptyDatabase } from "./assemble";
import {
  CHECKPOINT_POLICY,
  SPEED_MIN_REPORTERS,
  SPEED_MIN_SAMPLES,
  absorbDrive,
  affectsRouteRank,
  blankField,
  confirmPlace,
  confirmReport,
  countryById,
  disputeReport,
  fieldCensus,
  fieldFromDatabase,
  forgetCountry,
  holidayName,
  partnerSlots,
  predictEvent,
  predictRush,
  predictSpeed,
  readCell,
  publicPlaces,
  publicReports,
  registerCountry,
  reportPlace,
  reportConfidence,
  revenueDesk,
  routeWarnings,
  setSharing,
  submitAsk,
  submitEvent,
  submitPlace,
  submitReport,
  withdrawUser,
  advanceField,
  cellKey,
  confirmEvent,
} from "./field";
import type { FieldReportRecord } from "./types";

const at = "2026-11-04T08:30:00.000Z";
const now = new Date(at);
const accra = { lat: 5.6037, lng: -0.187 };

function report(state: ReturnType<typeof blankField>, userId: string, kind: string, extra: Partial<{ note: string; priceGhs: number | null; lat: number; lng: number; createdAt: string; country: string }> = {}) {
  return submitReport(state, {
    id: `${userId}-${kind}-${extra.createdAt ?? at}-${extra.lat ?? accra.lat}`,
    userId,
    country: extra.country ?? "gh",
    kind,
    lat: extra.lat ?? accra.lat,
    lng: extra.lng ?? accra.lng,
    note: extra.note ?? "",
    priceGhs: extra.priceGhs ?? null,
    createdAt: extra.createdAt ?? at,
  });
}

function shareDrive(state: ReturnType<typeof blankField>, userId: string, when = at, raining = false) {
  setSharing(state, userId, "gh", true, now);
  absorbDrive(state, {
    sessionId: `${userId}-${when}-${raining}`,
    userId,
    at: when,
    meanSpeedKph: 42,
    points: [accra, accra, accra, accra],
    raining,
    simulated: false,
    demo: false,
  });
}

describe("local road engine", () => {
  it("refuses checkpoint locations and does not store them", () => {
    const state = blankField();
    const result = report(state, "a", "checkpoint", { note: "on the ring road" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe(CHECKPOINT_POLICY);
    expect(state.reports).toHaveLength(0);
    expect(affectsRouteRank()).toBe(false);
    expect(partnerSlots().every((slot) => slot.status === "not_connected")).toBe(true);
    expect(revenueDesk().find((item) => item.name === "Featured businesses")?.state).toBe("not_connected");
  });

  it("rejects an enforcement note, a point outside the country, and a repeat", () => {
    const state = blankField();
    expect(report(state, "a", "accident", { note: "police checkpoint ahead" }).ok).toBe(false);
    expect(report(state, "a", "accident", { lat: 40, lng: -70 }).ok).toBe(false);
    expect(report(state, "a", "closure", { note: "tree down" }).ok).toBe(true);
    expect(report(state, "a", "closure", { note: "tree down" }).ok).toBe(false);
    expect(state.reports).toHaveLength(1);
    expect(state.reports[0].source).toBe("USER_PROVIDED");
  });

  it("confirms with a second driver, hides a pile of disputes, and caps confidence", () => {
    const state = blankField();
    expect(report(state, "author", "flood", { note: "water over the lane" }).ok).toBe(true);
    const id = state.reports[0].id;
    expect(state.reports[0].status).toBe("open");
    expect(confirmReport(state, id, "author", now).ok).toBe(false);
    expect(confirmReport(state, id, "b", now).ok).toBe(true);
    expect(state.reports[0].status).toBe("confirmed");
    expect(state.standing.find((row) => row.userId === "author")?.confirmedByOthers).toBe(1);
    const confidence = reportConfidence(state.reports[0], 4, now, 24);
    expect(confidence).toBeGreaterThanOrEqual(70);
    expect(confidence).toBeLessThanOrEqual(95);
    const disputed = blankField();
    report(disputed, "author", "pothole");
    const hole = disputed.reports[0].id;
    disputeReport(disputed, hole, "b", now);
    disputeReport(disputed, hole, "c", now);
    disputeReport(disputed, hole, "d", now);
    expect(disputed.reports[0].status).toBe("hidden");
    expect(disputed.standing.find((row) => row.userId === "author")?.hidden).toBe(1);
    expect(publicReports(disputed, "gh", now)).toHaveLength(0);
  });

  it("holds a reporter who was hidden twice until two other drivers agree", () => {
    const state = blankField();
    const standing = { userId: "repeat", submitted: 2, confirmedByOthers: 0, hidden: 2 };
    state.standing.push(standing);
    expect(report(state, "repeat", "breakdown", { note: "a car stopped" }).ok).toBe(true);
    expect(state.reports[0].status).toBe("held");
    confirmReport(state, state.reports[0].id, "b", now);
    expect(state.reports[0].status).toBe("held");
    confirmReport(state, state.reports[0].id, "c", now);
    expect(state.reports[0].status).toBe("confirmed");
  });

  it("stops a burst and a fuel price that is not a real litre price", () => {
    const state = blankField();
    for (let index = 0; index < 5; index += 1) {
      const result = report(state, "a", "pothole", { lat: accra.lat + index * 0.01, note: `hole ${index}` });
      expect(result.ok).toBe(true);
    }
    expect(report(state, "a", "pothole", { lat: accra.lat + 0.08, note: "another" }).ok).toBe(false);
    expect(report(blankField(), "a", "fuel_price", { priceGhs: 0 }).ok).toBe(false);
    const prices = blankField();
    expect(report(prices, "a", "fuel_price", { priceGhs: 14.2 }).ok).toBe(true);
    expect(prices.reports[0].priceGhs).toBe(14.2);
    expect(prices.reports[0].source).toBe("USER_PROVIDED");
  });

  it("publishes a speed only after enough drivers share, and keeps rain separate", () => {
    const state = blankField();
    shareDrive(state, "a");
    expect(predictSpeed(state, "gh", cellKey(accra.lat, accra.lng), now, "any").status).toBe("insufficient");
    expect(predictSpeed(state, "gh", cellKey(accra.lat, accra.lng), now, "any").meanKph).toBeNull();
    shareDrive(state, "b");
    shareDrive(state, "c");
    const reading = predictSpeed(state, "gh", cellKey(accra.lat, accra.lng), now, "any");
    expect(reading.status).toBe("ready");
    expect(reading.meanKph).toBe(42);
    expect(reading.reporters).toBeGreaterThanOrEqual(SPEED_MIN_REPORTERS);
    expect(reading.samples).toBeGreaterThanOrEqual(SPEED_MIN_SAMPLES);
    expect(reading.note).toMatch(/not live traffic/);
    expect(predictSpeed(state, "gh", cellKey(accra.lat, accra.lng), now, "rain").status).toBe("insufficient");
    shareDrive(state, "a", at, true);
    shareDrive(state, "b", at, true);
    shareDrive(state, "c", at, true);
    const rain = predictSpeed(state, "gh", cellKey(accra.lat, accra.lng), now, "rain");
    expect(rain.status).toBe("ready");
    expect(rain.note).toMatch(/marked as rain/);
    expect(rain.note).toMatch(/not a weather service/);
    const cell = cellKey(accra.lat, accra.lng);
    expect(readCell(state, cell, now, false).meanKph).toBe(42);
    expect(readCell(state, cell, now, true).note).toMatch(/marked as rain/);
  });

  it("does not fold a drive the driver did not agree to share, or a demonstration", () => {
    const state = blankField();
    absorbDrive(state, { sessionId: "s", userId: "a", at, meanSpeedKph: 40, points: [accra, accra], raining: false, simulated: false, demo: false });
    expect(state.cells).toHaveLength(0);
    expect(state.folds).toHaveLength(0);
    setSharing(state, "a", "gh", true, now);
    absorbDrive(state, { sessionId: "demo", userId: "a", at, meanSpeedKph: 40, points: [accra, accra], raining: false, simulated: true, demo: true });
    expect(state.cells).toHaveLength(0);
    expect(state.folds).toEqual(["demo"]);
  });

  it("keeps holiday and rush readings empty until those buckets have samples", () => {
    const pack = countryById("gh");
    expect(pack && holidayName(pack, 2026, 3, 6)).toBe("Independence Day");
    expect(pack && holidayName(pack, 2026, 4, 3)).toBe("Good Friday");
    expect(pack && holidayName(pack, 2026, 4, 6)).toBe("Easter Monday");
    expect(pack && holidayName(pack, 2026, 12, 4)).toBe("Farmers' Day");
    expect(pack && holidayName(pack, 2026, 11, 4)).toBeNull();
    if (!pack) return;
    for (let year = 2026; year <= 2036; year += 1) {
      expect(holidayName(pack, year, 1, 1)).toBe("New Year's Day");
      expect(holidayName(pack, year, 3, 6)).toBe("Independence Day");
      expect(holidayName(pack, year, 12, 25)).toBe("Christmas Day");
      const found = new Map<string, { month: number; day: number }>();
      for (let month = 1; month <= 12; month += 1) {
        for (let day = 1; day <= 31; day += 1) {
          const name = holidayName(pack, year, month, day);
          expect(name ?? "").not.toMatch(/eid|ramadan|mawlid/i);
          if (name) found.set(name, { month, day });
        }
      }
      const friday = found.get("Good Friday");
      const monday = found.get("Easter Monday");
      const farmers = found.get("Farmers' Day");
      expect(friday && new Date(Date.UTC(year, friday.month - 1, friday.day)).getUTCDay()).toBe(5);
      expect(monday && new Date(Date.UTC(year, monday.month - 1, monday.day)).getUTCDay()).toBe(1);
      expect(farmers && new Date(Date.UTC(year, farmers.month - 1, farmers.day)).getUTCDay()).toBe(5);
    }
    const state = blankField();
    const holiday = new Date("2026-03-06T08:00:00.000Z");
    const reading = predictSpeed(state, "gh", cellKey(accra.lat, accra.lng), holiday, "any");
    expect(reading.status).toBe("insufficient");
    expect(reading.meanKph).toBeNull();
    expect(reading.note).toMatch(/Independence Day/);
    const rush = predictRush(state, "gh", cellKey(accra.lat, accra.lng), now);
    expect(rush.status).toBe("insufficient");
    expect(rush.note.toLowerCase()).toMatch(/not enough/);
    for (const userId of ["a", "b", "c"]) shareDrive(state, userId, "2026-03-06T08:00:00.000Z");
    const ready = predictSpeed(state, "gh", cellKey(accra.lat, accra.lng), holiday, "any");
    expect(ready.status).toBe("ready");
    expect(ready.note).toMatch(/Independence Day/);
  });

  it("uses event speeds only after the event is confirmed and drives were shared", () => {
    const state = blankField();
    const cell = cellKey(accra.lat, accra.lng);
    expect(predictEvent(state, "gh", cell, now).status).toBe("insufficient");
    submitEvent(state, { id: "match", userId: "a", country: "gh", name: "Independence parade", lat: accra.lat, lng: accra.lng, startsAt: "2026-11-04T06:00:00.000Z", endsAt: "2026-11-04T12:00:00.000Z" });
    expect(predictEvent(state, "gh", cell, now).note).toMatch(/No confirmed event/);
    confirmEvent(state, "match", "b");
    expect(predictEvent(state, "gh", cell, now).note).toMatch(/Not enough drives/);
    for (const userId of ["a", "b", "c"]) {
      setSharing(state, userId, "gh", true, now);
      absorbDrive(state, { sessionId: `ev-${userId}`, userId, at, meanSpeedKph: 18, points: [accra, accra, accra, accra], raining: false, simulated: false, demo: false });
    }
    const reading = predictEvent(state, "gh", cell, now);
    expect(reading.status).toBe("ready");
    expect(reading.meanKph).toBe(18);
  });

  it("warns on a confirmed closure and never treats that as a new route order", () => {
    const state = blankField();
    report(state, "a", "closure", { note: "barrier across the lane" });
    const id = state.reports[0].id;
    expect(routeWarnings([accra], state.reports, now)).toHaveLength(0);
    confirmReport(state, id, "b", now);
    const warnings = routeWarnings([accra, { lat: accra.lat + 0.01, lng: accra.lng }], state.reports, now);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].source).toBe("USER_PROVIDED");
    expect(warnings[0].label).toMatch(/route order is unchanged/);
    expect(routeWarnings([{ lat: 6.2, lng: -0.1 }], state.reports, now)).toHaveLength(0);
    expect(affectsRouteRank()).toBe(false);
  });

  it("shows a place to others only after a second driver confirms it", () => {
    const state = blankField();
    submitPlace(state, { id: "station", userId: "a", country: "gh", kind: "trotro_station", name: "Madina station", note: "main stop", lat: accra.lat, lng: accra.lng, createdAt: at });
    expect(publicPlaces(state, "gh")).toHaveLength(0);
    expect(confirmPlace(state, "station", "a").ok).toBe(false);
    confirmPlace(state, "station", "b");
    expect(publicPlaces(state, "gh")[0].name).toBe("Madina station");
    expect(publicPlaces(state, "gh")[0].source).toBe("USER_PROVIDED");
    expect(reportPlace(state, { placeId: "station", userId: "a", reason: "gone", note: "" }).ok).toBe(false);
    expect(reportPlace(state, { placeId: "station", userId: "c", reason: "checkpoint", note: "" }).ok).toBe(false);
    reportPlace(state, { placeId: "station", userId: "c", reason: "wrong", note: "" });
    reportPlace(state, { placeId: "station", userId: "d", reason: "wrong", note: "" });
    expect(state.places[0].status).toBe("open");
    reportPlace(state, { placeId: "station", userId: "e", reason: "offensive", note: "" });
    expect(state.places[0].status).toBe("hidden");
    expect(publicPlaces(state, "gh")).toHaveLength(0);
    const asks: { id: string; userId: string; text: string; createdAt: string }[] = [];
    expect(submitAsk(asks, { id: "q", userId: "a", text: "avoid the police camera", createdAt: at }).ok).toBe(false);
    expect(submitAsk(asks, { id: "q2", userId: "a", text: "Please add a trotro reminder", createdAt: at }).ok).toBe(true);
    expect(asks).toHaveLength(1);
    expect(countryById("gh")?.reportKinds.some((kind) => kind.id === "debris")).toBe(true);
    expect(countryById("gh")?.reportKinds.some((kind) => kind.id === "animal")).toBe(true);
  });

  it("runs the same rules for a second country and strips a refused kind", () => {
    const pack = registerCountry({
      id: "zz",
      name: "Test Island",
      timezone: "UTC",
      currency: "X",
      bounds: { south: 0, west: 0, north: 1, east: 1 },
      rush: [],
      holidays: [],
      movable: [],
      reportKinds: [
        { id: "accident", label: "Accident", ttlHours: 6, detail: "seen" },
        { id: "checkpoint", label: "Checkpoint", ttlHours: 1, detail: "no" },
      ],
      placeKinds: [{ id: "shop", label: "Shop", group: "Business" }],
    });
    expect(pack.reportKinds.map((item) => item.id)).toEqual(["accident"]);
    const state = blankField();
    expect(report(state, "a", "accident", { country: "zz", lat: 0.4, lng: 0.4, note: "two cars" }).ok).toBe(true);
    expect(report(state, "a", "accident", { country: "zz", lat: 5.6, lng: -0.2, note: "outside" }).ok).toBe(false);
    expect(state.reports[0].country).toBe("zz");
    forgetCountry("zz");
    expect(countryById("zz")).toBeNull();
  });

  it("expires a flood on its own and removes what a driver shared", () => {
    const db = emptyDatabase();
    const state = fieldFromDatabase(db);
    report(state, "a", "flood", { note: "water", createdAt: "2026-11-01T00:00:00.000Z" });
    expect(advanceField(db, new Date("2026-11-03T00:00:00.000Z"))).toBe(true);
    expect(db.fieldReports[0].status).toBe("expired");
    const live = blankField();
    setSharing(live, "a", "gh", true, now);
    shareDrive(live, "a");
    report(live, "a", "pothole", { note: "edge" });
    withdrawUser(live, "a");
    expect(live.consents[0].sharing).toBe(false);
    expect(live.cells).toHaveLength(0);
    expect(live.reports).toHaveLength(0);
  });

  it("counts only stored rows and does not invent a crowd", () => {
    const census = fieldCensus(blankField(), "gh");
    expect(census.driversSharing).toBe(0);
    expect(census.publishedSpeeds).toBe(0);
    expect(census.note.toLowerCase()).not.toMatch(/100k|best in ghana|better than/);
    const state = blankField();
    report(state, "a", "signal", { note: "dark" });
    expect(publicReports(state, "gh", now)[0].status).toBe("open");
    expect(publicReports(state, "gh", now)[0].confidence).toBeLessThanOrEqual(40);
  });
});

describe("a warning never includes a kind the engine will not store", () => {
  it("ignores a hand-built checkpoint row", () => {
    const fake = {
      id: "x",
      country: "gh",
      kind: "checkpoint",
      lat: accra.lat,
      lng: accra.lng,
      cell: cellKey(accra.lat, accra.lng),
      reporterId: "a",
      note: "",
      priceGhs: null,
      createdAt: at,
      confirmations: ["b"],
      disputes: [],
      status: "confirmed",
      credited: true,
      penalised: false,
      source: "USER_PROVIDED",
    } as FieldReportRecord;
    expect(routeWarnings([accra], [fake], now)).toHaveLength(0);
  });
});
