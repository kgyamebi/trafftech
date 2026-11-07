import fs from "fs";
import path from "path";
import { emptyDatabase } from "@/domain/assemble";
import { normalizeDatabase, retainRecords } from "@/domain/retention";
import type { Database } from "@/domain/types";

const queues = new Map<string, Promise<unknown>>();

export function dataDir(dir?: string): string {
  return dir ?? path.join(process.cwd(), "data");
}

function dbPath(dir: string): string {
  return path.join(dir, "store.json");
}

export function readDatabase(dir = dataDir()): Database {
  const file = dbPath(dir);
  if (!fs.existsSync(file)) return emptyDatabase();
  try {
    const db = loadFile(file);
    if (retainRecords(db, new Date())) writeDatabase(dir, db);
    return db;
  } catch {
    const bak = `${file}.bak`;
    if (!fs.existsSync(bak)) throw new Error("The saved records could not be read.");
    let recovered: Database;
    try {
      recovered = loadFile(bak);
    } catch {
      throw new Error("The saved records could not be read.");
    }
    const broken = `${file}.broken`;
    if (!fs.existsSync(broken)) fs.copyFileSync(file, broken);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(recovered));
    fs.renameSync(tmp, file);
    return recovered;
  }
}

function loadFile(file: string): Database {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SyntaxError("Saved records are not an object.");
  }
  return normalizeDatabase(parsed as Partial<Database>);
}

function writeDatabase(dir: string, db: Database) {
  fs.mkdirSync(dir, { recursive: true });
  const file = dbPath(dir);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.copyFileSync(tmp, file);
    fs.rmSync(tmp, { force: true });
  }
}

export async function updateDatabase<T>(dir: string, fn: (db: Database) => T): Promise<T> {
  const prev = queues.get(dir) ?? Promise.resolve();
  const run = prev.then(() => {
    const db = readDatabase(dir);
    const result = fn(db);
    retainRecords(db, new Date());
    writeDatabase(dir, db);
    return result;
  });
  const settled = run.then(
    (value) => value,
    (error) => {
      throw error;
    },
  );
  queues.set(
    dir,
    settled.then(
      () => undefined,
      () => undefined,
    ),
  );
  return settled;
}
