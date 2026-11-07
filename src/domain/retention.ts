import { emptyDatabase } from "./assemble";
import { accraToday, addDays } from "./dates";
import type { Database, DrivingSessionRecord } from "./types";

/** Full speed samples stay for longer than the six-month score window. */
export const SAMPLE_KEEP_DAYS = 200;
/** One open trip cannot store an unbounded trace. */
export const MAX_SAMPLES = 8_000;
export const AUDIT_KEEP_DAYS = 365 * 3;
export const NOTE_KEEP_DAYS = 365 * 3;

const LISTS = [
  "users",
  "credentials",
  "vehicles",
  "documents",
  "violations",
  "evidence",
  "payments",
  "contests",
  "sessions",
  "notifications",
  "reads",
  "fleets",
  "fleetDrivers",
  "transfers",
  "questions",
  "audit",
  "places",
  "expenses",
] as const;

export function normalizeDatabase(parsed: Partial<Database> | null | undefined): Database {
  const source = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  const merged = { ...emptyDatabase(), ...source };
  for (const key of LISTS) {
    if (!Array.isArray(merged[key])) merged[key] = [];
  }
  return merged;
}

export function retainRecords(db: Database, now: Date): boolean {
  let changed = false;
  const sampleCutoff = addDays(accraToday(now), -SAMPLE_KEEP_DAYS);
  for (const session of db.sessions) {
    if (trimSession(session, sampleCutoff)) changed = true;
  }
  const auditCutoff = new Date(now.getTime() - AUDIT_KEEP_DAYS * 86_400_000).toISOString();
  const audit = db.audit.filter((row) => !row.at || row.at >= auditCutoff);
  if (audit.length !== db.audit.length) {
    db.audit = audit;
    changed = true;
  }
  const noteCutoff = new Date(now.getTime() - NOTE_KEEP_DAYS * 86_400_000).toISOString();
  const questions = db.questions.filter((row) => !row.createdAt || row.createdAt >= noteCutoff);
  if (questions.length !== db.questions.length) {
    db.questions = questions;
    changed = true;
  }
  const noticeCutoff = new Date(now.getTime() - 365 * 86_400_000).toISOString();
  const notifications = db.notifications.filter((row) => !row.createdAt || row.createdAt >= noticeCutoff);
  if (notifications.length !== db.notifications.length) {
    db.notifications = notifications;
    changed = true;
  }
  const noticeIds = new Set(db.notifications.map((row) => row.id));
  const reads = db.reads.filter((row) => noticeIds.has(row.id));
  if (reads.length !== db.reads.length) {
    db.reads = reads;
    changed = true;
  }
  return changed;
}

function trimSession(session: DrivingSessionRecord, sampleCutoff: string): boolean {
  let changed = false;
  if (session.samples.length > MAX_SAMPLES) {
    session.samples = session.samples.slice(-MAX_SAMPLES);
    changed = true;
  }
  const ended = session.endedAt?.slice(0, 10) ?? "";
  if (ended.length === 10 && ended < sampleCutoff) {
    if (session.samples.length > 0) {
      session.samples = [];
      changed = true;
    }
    if (session.geometry && session.geometry.length > 0) {
      session.geometry = [];
      changed = true;
    }
  }
  return changed;
}
