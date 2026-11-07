import { describe, expect, it } from "vitest";
import { emptyDatabase } from "./assemble";
import { settleReadings } from "./extract";
import { LESSON_USERS, absorbDrive, cellKey, confirmReport, fieldFromDatabase, setSharing, submitReport } from "./field";
import { advanceLiving, applyPractice, practiceLines, rememberDateCorrection, routeMemory, sharedPace } from "./living";
import { retainRecords } from "./retention";
import type { CommunityPlaceRecord, FieldEventRecord, FieldReportRecord } from "./types";

const now = new Date("2026-11-07T12:00:00.000Z");
const accra = { lat: 5.6037, lng: -0.187 };

function hiddenReport(index: number): FieldReportRecord {
  return {
    id: `h-${index}`,
    country: "gh",
    kind: "pothole",
    lat: accra.lat,
    lng: accra.lng,
    cell: cellKey(accra.lat, accra.lng),
    reporterId: `reporter-${index}`,
    note: "",
    priceGhs: null,
    createdAt: now.toISOString(),
    confirmations: [],
    disputes: [`disputer-${index}`],
    status: "hidden",
    credited: false,
    penalised: true,
    source: "USER_PROVIDED",
  };
}

describe("the record keeps itself current", () => {
  it("changes a document rule only after eight different people correct that date", () => {
    const db = emptyDatabase();
    for (let index = 0; index < LESSON_USERS - 1; index += 1) {
      setSharing(fieldFromDatabase(db), `user-${index}`, "gh", true, now);
      expect(rememberDateCorrection(db, `user-${index}`, "insurance", now)).toBe(true);
    }
    expect(rememberDateCorrection(db, "user-0", "insurance", now)).toBe(false);
    expect(practiceLines(db.lessons)).toEqual([]);

    setSharing(fieldFromDatabase(db), "user-7", "gh", true, now);
    expect(rememberDateCorrection(db, "user-7", "insurance", now)).toBe(true);
    const quiet = emptyDatabase();
    expect(rememberDateCorrection(quiet, "user-7", "insurance", now)).toBe(false);

    const when = new Date("2027-01-01T12:00:00.000Z");
    const calculated = settleReadings([{ text: "Comprehensive insurance\nPolicy EN-19\nVehicle GR 1234-20\nName of insured: Ama Mensah\nValid for 12 months from 1 June 2027", label: "Paste" }], "text", when);
    const printed = settleReadings([{ text: "Comprehensive insurance\nPolicy EN-19\nVehicle GR 1234-20\nName of insured: Ama Mensah\nExpiry 1 June 2028", label: "Paste" }], "text", when);
    expect(calculated.fields.find((field) => field.key === "expires")?.derived).toBe(true);
    expect(applyPractice(calculated, []).decision).toBe("accepted");
    const held = applyPractice(calculated, ["document:insurance:expires"]);
    expect(held.decision).toBe("refused");
    expect(held.suggestedExpiry).toBeNull();
    expect(held.reasons.join(" ")).toMatch(/not printed on the document/i);
    expect(printed.fields.find((field) => field.key === "expires")?.derived).toBe(false);
    expect(applyPractice(printed, ["document:insurance:expires"]).decision).toBe("accepted");
    expect(practiceLines(db.lessons)[0].line).toMatch(/calculated date/i);
    expect(practiceLines(db.lessons)[0].line).not.toMatch(/user-/);
  });

  it("asks for a second agreement after eight people dispute the same kind of report", () => {
    const db = emptyDatabase();
    db.fieldReports = Array.from({ length: LESSON_USERS }, (_, index) => hiddenReport(index));
    db.fieldReports.push({
      ...hiddenReport(99),
      id: "open-one",
      status: "confirmed",
      disputes: [],
      confirmations: ["friend"],
      penalised: false,
      reporterId: "owner",
    });
    expect(advanceLiving(db, now)).toBe(true);
    expect(db.fieldReports.find((report) => report.id === "open-one")?.status).toBe("open");
    const state = fieldFromDatabase(db);
    const saved = submitReport(state, {
      id: "fresh",
      userId: "owner-2",
      country: "gh",
      kind: "pothole",
      lat: accra.lat + 0.01,
      lng: accra.lng,
      note: "A dip",
      priceGhs: null,
      createdAt: now.toISOString(),
    });
    expect(saved.ok).toBe(true);
    const first = confirmReport(state, "fresh", "friend-2", now);
    const second = confirmReport(state, "fresh", "friend-3", now);
    expect(first.ok && first.status).toBe("open");
    expect(second.ok && second.status).toBe("confirmed");
    expect(advanceLiving(db, now)).toBe(false);
  });

  it("drops a speed that does not belong once enough drivers have shared, and then stays still", () => {
    const db = emptyDatabase();
    const state = fieldFromDatabase(db);
    for (let index = 0; index < 6; index += 1) {
      setSharing(state, `steady-${index}`, "gh", true, now);
      absorbDrive(state, {
        sessionId: `steady-${index}`,
        userId: `steady-${index}`,
        at: now.toISOString(),
        meanSpeedKph: 40,
        points: [accra, accra, accra, accra],
        raining: false,
        simulated: false,
        demo: false,
      });
    }
    setSharing(state, "wild", "gh", true, now);
    absorbDrive(state, {
      sessionId: "wild",
      userId: "wild",
      at: now.toISOString(),
      meanSpeedKph: 130,
      points: [accra, accra, accra, accra],
      raining: false,
      simulated: false,
      demo: false,
    });
    expect(advanceLiving(db, now)).toBe(true);
    const cell = db.roadCells.find((row) => row.kind === "hour");
    expect(cell?.shares.some((share) => share.userId === "wild")).toBe(false);
    expect(Math.round((cell?.speedSum ?? 0) / (cell?.samples ?? 1))).toBe(40);
    const note = sharedPace(db.roadCells, [accra, { lat: accra.lat + 0.002, lng: accra.lng }], now);
    expect(note).toMatch(/40 km\/h/);
    expect(note).toMatch(/not live traffic/i);
    expect(note).toMatch(/route order is unchanged/i);
    expect(sharedPace([], [accra, accra], now)).toBeNull();
    expect(advanceLiving(db, now)).toBe(false);
  });

  it("retires an unconfirmed place and a finished event without a person doing it", () => {
    const db = emptyDatabase();
    const old = "2020-01-01T00:00:00.000Z";
    const place: CommunityPlaceRecord = {
      id: "old-shop",
      country: "gh",
      kind: "shop",
      name: "Old shop",
      note: "",
      lat: accra.lat,
      lng: accra.lng,
      cell: cellKey(accra.lat, accra.lng),
      reporterId: "a",
      createdAt: old,
      confirmations: [],
      disputes: [],
      status: "open",
      source: "USER_PROVIDED",
    };
    const kept: CommunityPlaceRecord = { ...place, id: "kept", name: "Kept", status: "confirmed", confirmations: ["b"] };
    const event: FieldEventRecord = {
      id: "past",
      country: "gh",
      name: "Past market",
      lat: accra.lat,
      lng: accra.lng,
      cell: place.cell,
      startsAt: old,
      endsAt: old,
      reporterId: "a",
      confirmations: ["b"],
      status: "confirmed",
      source: "USER_PROVIDED",
    };
    db.communityPlaces = [place, kept];
    db.fieldEvents = [event];
    expect(advanceLiving(db, now)).toBe(true);
    expect(db.communityPlaces.map((row) => row.id)).toEqual(["kept"]);
    expect(db.fieldEvents).toEqual([]);
  });

  it("puts a confirmed hazard on the route and leaves the route order alone", () => {
    const closure: FieldReportRecord = {
      ...hiddenReport(1),
      id: "closure",
      kind: "closure",
      status: "confirmed",
      confirmations: ["other"],
      disputes: [],
      penalised: false,
    };
    const open = { ...closure, id: "open-closure", status: "open" as const, confirmations: [] };
    const far = { ...closure, id: "far", lat: 6.7, lng: -1.6 };
    const geometry = [accra, { lat: accra.lat + 0.0004, lng: accra.lng }];
    const memory = routeMemory([], [open, closure, far], geometry, now);
    expect(memory.warnings).toHaveLength(1);
    expect(memory.warnings[0]).toMatch(/road closure/i);
    expect(memory.warnings[0]).toMatch(/route order is unchanged/i);
    const ordered = ["first", "second"].map((id) => ({ id, ...routeMemory([], [closure], geometry, now) }));
    expect(ordered.map((route) => route.id)).toEqual(["first", "second"]);
    expect(routeMemory([], [closure], [{ lat: 6.7, lng: -1.6 }, { lat: 6.71, lng: -1.61 }], now).warnings).toEqual([]);
  });

  it("writes the day once and does not rewrite a quiet record", () => {
    const db = emptyDatabase();
    expect(retainRecords(db, now)).toBe(true);
    expect(db.livingDay).toBe("2026-11-07");
    expect(retainRecords(db, now)).toBe(false);
  });
});
