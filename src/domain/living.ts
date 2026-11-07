import { accraToday } from "./dates";
import type { Extraction } from "./extract";
import {
  LESSON_USERS,
  blankField,
  cellKey,
  predictSpeed,
  refreshReports,
  routeWarnings,
} from "./field";
import type { Database, DocumentReading, FieldReportRecord, LessonRecord, RoadCellRecord } from "./types";

/** An unconfirmed place is dropped after this many days. A confirmed place stays. */
export const PLACE_OPEN_DAYS = 90;
/** An event leaves the list this many days after it ends. Shared speeds from it stay in their cells. */
export const EVENT_AFTER_DAYS = 14;
export const SPEED_SETTLE_SAMPLES = 24;
export const SPEED_SETTLE_REPORTERS = 6;

const PRINTED = "The expiry date is not printed on the document.";

export function tightIds(lessons: LessonRecord[]): string[] {
  return lessons.filter((lesson) => lesson.users.length >= LESSON_USERS).map((lesson) => lesson.id);
}

export function practiceLines(lessons: LessonRecord[]): { id: string; people: number; line: string }[] {
  return tightIds(lessons).flatMap((id) => {
    const lesson = lessons.find((item) => item.id === id);
    if (!lesson) return [];
    const line = effectLine(id, lesson.users.length);
    return line ? [{ id, people: lesson.users.length, line }] : [];
  });
}

export function rememberDateCorrection(db: Database, userId: string, kind: string, at: Date): boolean {
  const sharing = db.fieldConsents.some((row) => row.userId === userId && row.country === "gh" && row.sharing);
  if (!sharing || !kind || kind === "other") return false;
  return ensureLesson(db, `document:${kind}:expires`, [userId], at);
}

export function ensureLesson(db: Database, id: string, users: string[], at: Date): boolean {
  if (!db.lessons) db.lessons = [];
  let lesson = db.lessons.find((item) => item.id === id);
  if (!lesson) {
    lesson = { id, users: [], updatedAt: at.toISOString() };
    db.lessons.push(lesson);
  }
  let changed = false;
  for (const userId of users) {
    if (!userId || lesson.users.includes(userId) || lesson.users.length >= 80) continue;
    lesson.users.push(userId);
    lesson.updatedAt = at.toISOString();
    changed = true;
  }
  if (db.lessons.length > 400) {
    db.lessons.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1));
    db.lessons.splice(0, db.lessons.length - 400);
    changed = true;
  }
  return changed;
}

export function applyPractice(result: Extraction, tight: string[]): Extraction {
  if (!result.suggestedKind || !tight.includes(`document:${result.suggestedKind}:expires`)) return result;
  const expiry = result.fields.find((field) => field.key === "expires");
  if (!expiry?.derived || result.reasons.includes(PRINTED)) return result;
  const reasons = [...result.reasons, PRINTED].slice(0, 4);
  return {
    ...result,
    decision: "refused",
    reasons,
    suggestedExpiry: null,
    note: "Not accepted.",
  };
}

export function applyPracticeReading(reading: DocumentReading, kind: string, tight: string[]): DocumentReading {
  if (!tight.includes(`document:${kind}:expires`)) return reading;
  const expiry = reading.fields.find((field) => field.label === "Expiry");
  if (!expiry?.derived || reading.reasons.includes(PRINTED)) return reading;
  const reasons = [...reading.reasons, PRINTED].slice(0, 4);
  return { ...reading, decision: "refused", reasons };
}

export function routeMemory(
  cells: RoadCellRecord[],
  reports: FieldReportRecord[],
  geometry: { lat: number; lng: number }[],
  when: Date,
): { memoryNote?: string; warnings: string[] } {
  const pace = sharedPace(cells, geometry, when);
  return {
    memoryNote: pace ?? undefined,
    warnings: routeWarnings(geometry, reports, when).map((warning) => warning.label),
  };
}

export function sharedPace(cells: RoadCellRecord[], points: { lat: number; lng: number }[], when: Date): string | null {
  if (points.length < 2) return null;
  const state = blankField();
  state.cells = cells;
  const step = Math.max(1, Math.floor(points.length / 8));
  let best: { meanKph: number; samples: number; reporters: number } | null = null;
  const seen = new Set<string>();
  for (let index = 0; index < points.length; index += step) {
    const key = cellKey(points[index].lat, points[index].lng);
    if (seen.has(key)) continue;
    seen.add(key);
    const reading = predictSpeed(state, "gh", key, when, "any");
    if (reading.status !== "ready" || reading.meanKph == null) continue;
    if (!best || reading.samples > best.samples) best = { meanKph: reading.meanKph, samples: reading.samples, reporters: reading.reporters };
  }
  if (!best) return null;
  return `Shared drives at this hour average ${best.meanKph} km/h. The route order is unchanged. This is not live traffic.`;
}

export function advanceLiving(db: Database, now: Date): boolean {
  let changed = false;
  if (dropOpenPlaces(db, now)) changed = true;
  if (dropFinishedEvents(db, now)) changed = true;
  if (learnReportBars(db, now)) changed = true;
  if (refreshReports(db, now)) changed = true;
  if (settleSpeeds(db)) changed = true;
  if (dropOldAsks(db, now)) changed = true;
  const today = accraToday(now);
  if (db.livingDay !== today) {
    db.livingDay = today;
    changed = true;
  }
  return changed;
}

function learnReportBars(db: Database, now: Date): boolean {
  const kinds = new Set(db.fieldReports.map((report) => report.kind));
  let changed = false;
  for (const kind of kinds) {
    const hidden = db.fieldReports.filter((report) => report.kind === kind && report.status === "hidden");
    const confirmed = db.fieldReports.filter((report) => report.kind === kind && report.status === "confirmed");
    if (hidden.length <= confirmed.length) continue;
    const disputers = new Set<string>();
    for (const report of hidden) for (const userId of report.disputes) if (userId) disputers.add(userId);
    if (disputers.size < LESSON_USERS) continue;
    if (ensureLesson(db, `report:${kind}`, [...disputers], now)) changed = true;
  }
  return changed;
}

function dropOpenPlaces(db: Database, now: Date): boolean {
  const cutoff = now.getTime() - PLACE_OPEN_DAYS * 86_400_000;
  const before = db.communityPlaces.length;
  const kept = db.communityPlaces.filter((place) => place.status === "confirmed" || new Date(place.createdAt).getTime() >= cutoff);
  if (kept.length !== before) db.communityPlaces = kept;
  if (db.communityPlaces.length > 8_000) {
    const confirmed = db.communityPlaces.filter((place) => place.status === "confirmed").slice(-8_000);
    const room = 8_000 - confirmed.length;
    const rest = db.communityPlaces.filter((place) => place.status !== "confirmed").slice(-Math.max(0, room));
    db.communityPlaces = [...confirmed, ...rest];
  }
  return db.communityPlaces.length !== before;
}

function dropFinishedEvents(db: Database, now: Date): boolean {
  const cutoff = now.getTime() - EVENT_AFTER_DAYS * 86_400_000;
  const kept = db.fieldEvents.filter((event) => new Date(event.endsAt).getTime() >= cutoff);
  if (kept.length === db.fieldEvents.length) return false;
  db.fieldEvents = kept;
  return true;
}

function settleSpeeds(db: Database): boolean {
  let changed = false;
  for (const cell of db.roadCells) {
    if (cell.samples < SPEED_SETTLE_SAMPLES || cell.shares.length < SPEED_SETTLE_REPORTERS) continue;
    if (cell.settledAt && cell.settledAt >= cell.updatedAt) continue;
    const means = cell.shares.map((share) => (share.samples > 0 ? share.speedSum / share.samples : 0)).sort((a, b) => a - b);
    const mid = Math.floor(means.length / 2);
    const median = means.length % 2 === 1 ? means[mid] : (means[mid - 1] + means[mid]) / 2;
    const keep = cell.shares.filter((share) => {
      const mean = share.samples > 0 ? share.speedSum / share.samples : 0;
      return mean <= median * 2 && mean >= median * 0.5;
    });
    if (keep.length < cell.shares.length && keep.length >= SPEED_SETTLE_REPORTERS && keep.length * 2 >= cell.shares.length) {
      cell.shares = keep;
      cell.samples = keep.reduce((sum, share) => sum + share.samples, 0);
      cell.speedSum = keep.reduce((sum, share) => sum + share.speedSum, 0);
      changed = true;
    }
    cell.settledAt = cell.updatedAt;
    changed = true;
  }
  return changed;
}

function dropOldAsks(db: Database, now: Date): boolean {
  if (!Array.isArray(db.asks)) db.asks = [];
  const cutoff = now.getTime() - 400 * 86_400_000;
  const kept = db.asks.filter((row) => new Date(row.createdAt).getTime() >= cutoff);
  if (kept.length === db.asks.length) return false;
  db.asks = kept;
  return true;
}

function effectLine(id: string, _people: number): string {
  if (id.startsWith("document:") && id.endsWith(":expires")) {
    const kind = id.split(":")[1]?.replaceAll("_", " ") ?? "document";
    return `A calculated date on a ${kind} is no longer accepted.`;
  }
  if (id.startsWith("report:")) return "A reported kind is handled more strictly.";
  return "";
}
