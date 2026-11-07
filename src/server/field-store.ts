import "server-only";
import { randomUUID } from "crypto";
import type { MapMark } from "@/domain/catalogue";
import {
  CHECKPOINT_POLICY,
  absorbDrive,
  confirmEvent,
  confirmPlace,
  editPlace,
  confirmReport,
  consentFor,
  countryById,
  disputeReport,
  cellKey,
  fieldCensus,
  fieldFromDatabase,
  partnerSlots,
  readCell,
  ownStandingNote,
  publicPlaces,
  publicReports,
  revenueDesk,
  setSharing,
  reportPlace,
  submitAsk,
  submitEvent,
  submitPlace,
  submitReport,
  withdrawUser,
  type FieldCensus,
  type PublicPlace,
  type PublicReport,
} from "@/domain/field";
import { practiceLines, tightIds } from "@/domain/living";
import type { Database } from "@/domain/types";
import { AccountError } from "./accounts";
import { dataDir, readDatabase, updateDatabase } from "./store";

const COUNTRY = "gh";

function requireUser(db: Database, userId: string) {
  const user = db.users.find((row) => row.id === userId);
  if (!user) throw new AccountError("Account not found.");
  return user;
}

function movingMean(samples: { speedKph: number }[]): number | null {
  const moving = samples.map((sample) => sample.speedKph).filter((speed) => speed >= 5);
  if (!moving.length) return null;
  return moving.reduce((sum, speed) => sum + speed, 0) / moving.length;
}

export interface FieldPage {
  countryName: string;
  sharing: boolean;
  canWrite: boolean;
  census: FieldCensus;
  reports: PublicReport[];
  places: PublicPlace[];
  openReports: { id: string; label: string; status: string; note: string; mine: boolean }[];
  openPlaces: { id: string; name: string; label: string; status: string; phone: string; hours: string; note: string; services: string; mine: boolean }[];
  standingNote: string;
  events: { id: string; name: string; status: string }[];
  reportKinds: { id: string; label: string; detail: string }[];
  placeKinds: { id: string; label: string; group: string }[];
  partners: { sector: string; status: "not_connected"; note: string }[];
  revenue: { name: string; state: "available" | "partial" | "not_connected"; detail: string }[];
  policy: string;
  practice: { id: string; people: number; line: string }[];
  livingDay: string;
}

export function documentTight(mode: "user" | "demo"): string[] {
  if (mode !== "user") return [];
  return tightIds(readDatabase().lessons ?? []).filter((id) => id.startsWith("document:"));
}

export function loadFieldPage(userId: string | null, mode: "user" | "demo"): FieldPage {
  const pack = countryById(COUNTRY);
  const db = mode === "user" ? readDatabase() : null;
  const source = db ? fieldFromDatabase(db) : { consents: [], cells: [], reports: [], places: [], standing: [], events: [], folds: [], bars: [] };
  const now = new Date();
  return {
    countryName: pack?.name ?? "Ghana",
    sharing: userId && mode === "user" ? consentFor(source, userId, COUNTRY) : false,
    canWrite: mode === "user" && Boolean(userId),
    census: fieldCensus(source, COUNTRY),
    reports: publicReports(source, COUNTRY, now),
    places: publicPlaces(source, COUNTRY),
    openReports: source.reports
      .filter((report) => report.status === "open" || report.status === "held" || report.status === "confirmed")
      .slice(-12)
      .reverse()
      .map((report) => ({
        id: report.id,
        label: pack?.reportKinds.find((kind) => kind.id === report.kind)?.label ?? report.kind,
        status: report.status,
        note: report.note,
        mine: mode === "user" && report.reporterId === userId,
      })),
    openPlaces: source.places.slice(-8).reverse().map((place) => ({
      id: place.id,
      name: place.name,
      label: pack?.placeKinds.find((kind) => kind.id === place.kind)?.label ?? place.kind,
      status: place.status,
      phone: place.phone ?? "",
      hours: place.hours ?? "",
      note: place.note,
      services: place.services ?? "",
      mine: mode === "user" && place.reporterId === userId,
    })),
    events: source.events.slice(-6).reverse().map((event) => ({ id: event.id, name: event.name, status: event.status })),
    reportKinds: (pack?.reportKinds ?? []).map((kind) => ({ id: kind.id, label: kind.label, detail: kind.detail })),
    placeKinds: (pack?.placeKinds ?? []).map((kind) => ({ id: kind.id, label: kind.label, group: kind.group })),
    partners: partnerSlots(),
    revenue: revenueDesk(),
    policy: CHECKPOINT_POLICY,
    practice: db ? practiceLines(db.lessons ?? []) : [],
    livingDay: db?.livingDay ?? "",
    standingNote: ownStandingNote(mode === "user" && userId ? source.standing.find((row) => row.userId === userId) : undefined),
  };
}

export async function setFieldSharing(dir: string, userId: string, sharing: boolean) {
  await updateDatabase(dir, (db) => {
    requireUser(db, userId);
    const state = fieldFromDatabase(db);
    setSharing(state, userId, COUNTRY, sharing, new Date());
    if (sharing) {
      for (const session of db.sessions) {
        if (session.userId !== userId || session.simulated || session.dataClass === "DEMO") continue;
        absorbDrive(state, {
          sessionId: session.id,
          userId,
          at: session.endedAt || session.startedAt,
          meanSpeedKph: movingMean(session.samples),
          points: session.geometry ?? [],
          raining: false,
          simulated: false,
          demo: false,
        });
      }
    }
    db.audit.push({ id: randomUUID(), at: new Date().toISOString(), actorId: userId, action: sharing ? "field_share_on" : "field_share_off", entity: "field", entityId: userId });
  });
}

export async function removeFieldShare(dir: string, userId: string) {
  await updateDatabase(dir, (db) => {
    requireUser(db, userId);
    withdrawUser(fieldFromDatabase(db), userId);
    db.audit.push({ id: randomUUID(), at: new Date().toISOString(), actorId: userId, action: "field_withdrawn", entity: "field", entityId: userId });
  });
}

export async function addFieldReport(dir: string, userId: string, input: { kind: string; lat: number; lng: number; note: string; priceGhs: number | null }) {
  return updateDatabase(dir, (db) => {
    requireUser(db, userId);
    const result = submitReport(fieldFromDatabase(db), {
      id: randomUUID(),
      userId,
      country: COUNTRY,
      kind: input.kind,
      lat: input.lat,
      lng: input.lng,
      note: input.note,
      priceGhs: input.priceGhs,
      createdAt: new Date().toISOString(),
    });
    if (!result.ok) throw new AccountError(result.message);
    db.audit.push({ id: randomUUID(), at: new Date().toISOString(), actorId: userId, action: "field_report", entity: "field", entityId: result.id });
    return result;
  });
}

export async function agreeFieldReport(dir: string, userId: string, reportId: string, agree: boolean) {
  return updateDatabase(dir, (db) => {
    requireUser(db, userId);
    const state = fieldFromDatabase(db);
    const result = agree ? confirmReport(state, reportId, userId, new Date()) : disputeReport(state, reportId, userId, new Date());
    if (!result.ok) throw new AccountError(result.message);
    return result;
  });
}

export async function addCommunityPlace(dir: string, userId: string, input: { kind: string; name: string; note: string; lat: number; lng: number; phone?: string; hours?: string; services?: string }) {
  return updateDatabase(dir, (db) => {
    requireUser(db, userId);
    const result = submitPlace(fieldFromDatabase(db), { id: randomUUID(), userId, country: COUNTRY, ...input, createdAt: new Date().toISOString() });
    if (!result.ok) throw new AccountError(result.message);
    return result;
  });
}

export async function editCommunityPlace(dir: string, userId: string, input: { id: string; name: string; note: string; phone?: string; hours?: string; services?: string }) {
  return updateDatabase(dir, (db) => {
    requireUser(db, userId);
    const result = editPlace(fieldFromDatabase(db), { userId, ...input });
    if (!result.ok) throw new AccountError(result.message);
    return result;
  });
}

export async function reportCommunityPlace(dir: string, userId: string, input: { placeId: string; reason: string; note: string }) {
  return updateDatabase(dir, (db) => {
    requireUser(db, userId);
    const result = reportPlace(fieldFromDatabase(db), { userId, placeId: input.placeId, reason: input.reason, note: input.note });
    if (!result.ok) throw new AccountError(result.message);
    return result;
  });
}

export async function addAsk(dir: string, userId: string, text: string) {
  return updateDatabase(dir, (db) => {
    requireUser(db, userId);
    if (!Array.isArray(db.asks)) db.asks = [];
    const result = submitAsk(db.asks, { id: randomUUID(), userId, text, createdAt: new Date().toISOString() });
    if (!result.ok) throw new AccountError(result.message);
    return result;
  });
}

export async function agreeCommunityPlace(dir: string, userId: string, placeId: string) {
  return updateDatabase(dir, (db) => {
    requireUser(db, userId);
    const result = confirmPlace(fieldFromDatabase(db), placeId, userId);
    if (!result.ok) throw new AccountError(result.message);
    return result;
  });
}

export async function addFieldEvent(dir: string, userId: string, input: { name: string; lat: number; lng: number; startsAt: string; endsAt: string }) {
  return updateDatabase(dir, (db) => {
    requireUser(db, userId);
    const result = submitEvent(fieldFromDatabase(db), { id: randomUUID(), userId, country: COUNTRY, ...input });
    if (!result.ok) throw new AccountError(result.message);
    return result;
  });
}

export async function agreeFieldEvent(dir: string, userId: string, eventId: string) {
  return updateDatabase(dir, (db) => {
    requireUser(db, userId);
    const result = confirmEvent(fieldFromDatabase(db), eventId, userId);
    if (!result.ok) throw new AccountError(result.message);
    return result;
  });
}

export function nearField(point: { lat: number; lng: number }, mode: "user" | "demo", raining = false) {
  const emptyNote = "The demonstration does not read or add the shared road layer.";
  if (mode === "demo") {
    return {
      ok: true as const,
      speed: { status: "insufficient" as const, meanKph: null, samples: 0, reporters: 0, note: emptyNote },
      reports: [] as PublicReport[],
      places: [] as PublicPlace[],
      note: emptyNote,
    };
  }
  const state = fieldFromDatabase(readDatabase(dataDir()));
  const now = new Date();
  const cell = cellKey(point.lat, point.lng);
  const speed = readCell(state, cell, now, raining);
  return {
    ok: true as const,
    speed: { status: speed.status, meanKph: speed.meanKph, samples: speed.samples, reporters: speed.reporters, note: speed.note },
    reports: publicReports(state, COUNTRY, now, point, 2_000),
    places: publicPlaces(state, COUNTRY, point, 3_000),
    note: "Speeds are calculated from drivers who shared. Reports are what drivers wrote. Neither is live traffic.",
  };
}

/** Confirmed places and reports for the map. The demonstration does not read this layer. */
export function loadMapMarks(mode: "user" | "demo"): MapMark[] {
  if (mode !== "user") return [];
  try {
    const state = fieldFromDatabase(readDatabase(dataDir()));
    const now = new Date();
    const places = publicPlaces(state, COUNTRY).map((place) => ({
      id: `place:${place.id}`,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      kind: "place" as const,
      detail: [place.label, place.phone ? `Phone entered by a driver: ${place.phone}` : "", place.hours ? `Hours entered by a driver: ${place.hours}` : ""]
        .filter(Boolean)
        .join(". "),
    }));
    const reports = publicReports(state, COUNTRY, now)
      .filter((report) => report.status === "confirmed")
      .map((report) => ({
        id: `report:${report.id}`,
        name: report.label,
        lat: report.lat,
        lng: report.lng,
        kind: "report" as const,
        detail: report.note ? `${report.detail} ${report.note}` : report.detail,
      }));
    return [...places, ...reports].slice(0, 80);
  } catch {
    return [];
  }
}
