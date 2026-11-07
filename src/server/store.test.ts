import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { pendingTripFrom } from "@/domain/pending-trip";
import { defaultPrefs, type DrivingSessionRecord, type UserRecord } from "@/domain/types";
import { saveDrivingSession } from "./accounts";
import { readDatabase, updateDatabase } from "./store";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "nokware-"));
  dirs.push(dir);
  return dir;
}

describe("saved records survive a bad write", () => {
  it("reads the previous copy when the current file is damaged", async () => {
    const dir = tempDir();
    await updateDatabase(dir, (db) => {
      db.audit.push({ id: "first", at: "2030-01-01T00:00:00.000Z", actorId: "u", action: "kept", entity: "user", entityId: "u" });
    });
    await updateDatabase(dir, (db) => {
      db.audit.push({ id: "second", at: "2030-01-02T00:00:00.000Z", actorId: "u", action: "kept", entity: "user", entityId: "u" });
    });
    const file = path.join(dir, "store.json");
    writeFileSync(file, "{");
    const recovered = readDatabase(dir);
    expect(recovered.audit.map((row) => row.id)).toEqual(["first"]);
    expect(readFileSync(`${file}.broken`, "utf8")).toBe("{");
    expect(JSON.parse(readFileSync(file, "utf8")).audit).toHaveLength(1);
  });

  it("fills lists that an older file never had", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "store.json"), JSON.stringify({ users: [{ id: "u" }] }));
    const db = readDatabase(dir);
    expect(db.users).toHaveLength(1);
    expect(db.expenses).toEqual([]);
    expect(db.sessions).toEqual([]);
    expect(db.places).toEqual([]);
  });

  it("does not replace both damaged copies with an empty account", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "store.json"), "{");
    writeFileSync(path.join(dir, "store.json.bak"), "{");
    expect(() => readDatabase(dir)).toThrow(/could not be read/);
    expect(readFileSync(path.join(dir, "store.json"), "utf8")).toBe("{");
  });

  it("keeps an old trip but not its speed trace", async () => {
    const dir = tempDir();
    await updateDatabase(dir, (db) => {
      db.sessions.push({
        id: "old",
        userId: "u",
        vehicleId: null,
        driverId: null,
        startedAt: "2020-01-01T00:00:00.000Z",
        endedAt: "2020-01-01T01:00:00.000Z",
        roadContext: "Urban",
        samples: [{ t: "2020-01-01T00:10:00.000Z", speedKph: 42, limitKph: 50 }],
        harshBrakes: 1,
        harshAccelerations: 0,
        simulated: false,
        source: "CALCULATED",
        dataClass: "REAL",
      } satisfies DrivingSessionRecord);
      db.documents.push({ id: "paper" } as never);
    });
    const saved = readDatabase(dir);
    expect(saved.sessions[0].samples).toEqual([]);
    expect(saved.sessions[0].harshBrakes).toBe(1);
    expect(saved.documents).toHaveLength(1);
  });

  it("stores one trip when the same drive is sent twice", async () => {
    const dir = tempDir();
    const user: UserRecord = {
      id: "u",
      email: "ama@example.com",
      name: "Ama",
      role: "driver",
      plan: "free",
      planStatus: "active",
      onboardingCompleted: true,
      createdAt: "2030-01-01T00:00:00.000Z",
      activeVehicleId: null,
      dataClass: "REAL",
      prefs: defaultPrefs(),
    };
    await updateDatabase(dir, (db) => {
      db.users.push(user);
    });
    const trip = {
      clientId: "2030-06-01T10:00:00.000Z",
      vehicleId: null,
      driverId: null,
      startedAt: "2030-06-01T10:00:00.000Z",
      endedAt: "2030-06-01T10:20:00.000Z",
      roadContext: "navigation",
      samples: [{ t: "2030-06-01T10:05:00.000Z", speedKph: 40, limitKph: 50 }],
      harshBrakes: 0,
      harshAccelerations: 0,
    };
    const first = await saveDrivingSession(dir, "u", trip);
    const second = await saveDrivingSession(dir, "u", { ...trip, harshBrakes: 4 });
    expect(second.id).toBe(first.id);
    const saved = readDatabase(dir);
    expect(saved.sessions).toHaveLength(1);
    expect(saved.sessions[0].harshBrakes).toBe(0);
    const forged = await saveDrivingSession(dir, "u", {
      ...trip,
      clientId: "2030-06-01T11:00:00.000Z",
      startedAt: "2030-06-01T11:00:00.000Z",
      endedAt: "2030-06-01T11:20:00.000Z",
      samples: [
        { t: "2030-06-01T11:05:00.000Z", speedKph: 60, limitKph: 50 },
        { t: "2030-06-01T11:06:00.000Z", speedKph: 20, limitKph: 50 },
      ],
      harshBrakes: 0,
      harshAccelerations: 0,
    });
    expect(forged.harshBrakes).toBeGreaterThan(0);
    await expect(saveDrivingSession(dir, "u", { ...trip, clientId: "2030-06-01T12:00:00.000Z", endedAt: "2030-06-01T09:00:00.000Z" })).rejects.toThrow(/could not be saved/);
  });

  it("drops a stored trip that is not a trip", () => {
    expect(pendingTripFrom(null)).toBeNull();
    expect(pendingTripFrom({ clientId: "short", samples: [] })).toBeNull();
    const kept = pendingTripFrom({
      clientId: "2030-06-01T10:00:00.000Z",
      startedAt: "2030-06-01T10:00:00.000Z",
      endedAt: "2030-06-01T10:20:00.000Z",
      roadContext: "navigation",
      samples: [{ t: "2030-06-01T10:05:00.000Z", speedKph: 40, limitKph: 50 }, { t: "bad" }],
      harshBrakes: 1.2,
    });
    expect(kept?.samples).toHaveLength(1);
    expect(kept?.harshBrakes).toBe(1);
    expect(kept?.vehicleId).toBeNull();
  });
});
