import { describe, expect, it } from "vitest";
import { emptyDatabase } from "./assemble";
import { documentStatus } from "./compliance";
import { addDays, daysUntil, isCalendarDate } from "./dates";
import { buildDemoWorkspace, demoPersonalSessions } from "./demo";
import { normalizeDatabase, retainRecords, SAMPLE_KEEP_DAYS } from "./retention";
import type { DrivingSessionRecord } from "./types";

const noon = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

function trip(endedAt: string, samples = 3): DrivingSessionRecord {
  return {
    id: endedAt,
    userId: "u",
    vehicleId: "v",
    driverId: null,
    startedAt: endedAt,
    endedAt,
    roadContext: "Urban",
    samples: Array.from({ length: samples }, (_, index) => ({
      t: endedAt,
      speedKph: 40 + index,
      limitKph: 50,
    })),
    harshBrakes: 0,
    harshAccelerations: 0,
    simulated: false,
    source: "CALCULATED",
    dataClass: "REAL",
    geometry: [{ lat: 5.6, lng: -0.18 }],
  };
}

describe("calendar dates stay exact for decades", () => {
  it.each([
    ["2028-02-28", 1, "2028-02-29"],
    ["2028-02-29", 1, "2028-03-01"],
    ["2028-02-29", 366, "2029-03-01"],
    ["2100-02-28", 1, "2100-03-01"],
    ["2032-02-28", 1, "2032-02-29"],
    ["2026-12-31", 1, "2027-01-01"],
  ])("adds days from %s", (from, days, to) => {
    expect(addDays(from, days)).toBe(to);
  });

  it("rejects dates that are not real days", () => {
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2032-02-29")).toBe(true);
    expect(isCalendarDate("2100-02-29")).toBe(false);
    expect(isCalendarDate("2030-02-29")).toBe(false);
    expect(isCalendarDate("2028-02-30")).toBe(false);
    expect(isCalendarDate("2028-13-01")).toBe(false);
    expect(daysUntil("2028-02-30", noon("2028-02-01"))).toBeNull();
    expect(documentStatus("2028-02-30", noon("2028-02-01")).status).toBe("unknown");
  });

  it("keeps a paper valid or expired across later years", () => {
    expect(documentStatus("2032-02-29", noon("2032-01-01")).status).toBe("valid");
    expect(documentStatus("2028-02-29", noon("2028-02-28")).daysRemaining).toBe(1);
    expect(documentStatus("2028-02-29", noon("2028-03-01")).status).toBe("expired");
    expect(documentStatus("2035-11-06", noon("2026-11-06")).status).toBe("valid");
  });
});

describe("saved driving stays usable years later", () => {
  it("keeps the demo score at 94 when the clock is in 2030", () => {
    const now = noon("2030-06-15");
    expect(buildDemoWorkspace(now).score.overall).toBe(94);
    const [earlier, current] = demoPersonalSessions(now);
    expect(current.samples[0].t.startsWith("2030-06-15")).toBe(true);
    expect(earlier.samples[0].t.startsWith("2030-")).toBe(true);
    expect(current.samples.every((sample) => sample.t >= current.startedAt && sample.t <= current.endedAt)).toBe(true);
  });

  it("keeps recent samples and the trip row, and drops only an old trace", () => {
    const now = noon("2030-06-15");
    const db = emptyDatabase();
    db.sessions.push(trip("2030-06-10T10:00:00.000Z"));
    db.sessions.push(trip(addDays("2030-06-15", -(SAMPLE_KEEP_DAYS - 1)) + "T10:00:00.000Z"));
    db.sessions.push(trip("2024-01-01T10:00:00.000Z"));
    db.documents.push({ id: "paper" } as never);
    db.payments.push({ id: "paid" } as never);
    db.audit.push(
      { id: "new", at: "2030-06-01T00:00:00.000Z", actorId: "u", action: "kept", entity: "user", entityId: "u" },
      { id: "old", at: "2020-01-01T00:00:00.000Z", actorId: "u", action: "aged", entity: "user", entityId: "u" },
    );
    expect(retainRecords(db, now)).toBe(true);
    expect(db.sessions[0].samples).toHaveLength(3);
    expect(db.sessions[1].samples).toHaveLength(3);
    expect(db.sessions[2].id).toBe("2024-01-01T10:00:00.000Z");
    expect(db.sessions[2].samples).toEqual([]);
    expect(db.sessions[2].geometry).toEqual([]);
    expect(db.sessions[2].harshBrakes).toBe(0);
    expect(db.documents).toHaveLength(1);
    expect(db.payments).toHaveLength(1);
    expect(db.audit.map((row) => row.id)).toEqual(["new"]);
  });

  it("opens an older save that has none of the later lists", () => {
    const db = normalizeDatabase({ users: [{ id: "u" } as never] });
    expect(db.users).toHaveLength(1);
    expect(db.expenses).toEqual([]);
    expect(db.sessions).toEqual([]);
    expect(db.places).toEqual([]);
    expect(normalizeDatabase(null).documents).toEqual([]);
  });

  it("caps one trip that stored far too many samples", () => {
    const db = emptyDatabase();
    db.sessions.push(trip("2030-06-15T10:00:00.000Z", 8_100));
    retainRecords(db, noon("2030-06-15"));
    expect(db.sessions[0].samples).toHaveLength(8_000);
    expect(db.sessions[0].samples[0].speedKph).toBe(40 + 100);
  });
});
