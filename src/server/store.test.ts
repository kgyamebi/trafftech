import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { DrivingSessionRecord } from "@/domain/types";
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
});
