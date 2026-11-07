import { placeHours, placePhone } from "./catalogue";
import { formatDay } from "./dates";
import { isEvasionRequest } from "./inbox";
import type {
  AskRecord,
  CommunityPlaceRecord,
  Database,
  FieldConsentRecord,
  FieldEventRecord,
  FieldReportRecord,
  FieldReportStatus,
  ReporterStandingRecord,
  RoadCellRecord,
} from "./types";

/**
 * Local road memory. A country is a pack. The same rules score reports,
 * group speeds, and refuse enforcement locations in every country.
 * A speed, price, or warning is published only from what drivers shared.
 */

export const SPEED_MIN_SAMPLES = 8;
export const SPEED_MIN_REPORTERS = 3;
export const SHARES_PER_CELL = 40;
export const SAMPLES_PER_DRIVE = 4;
export const CONFIDENCE_CAP = 95;
export const REPORTS_PER_HOUR = 8;
export const BURST_PER_10_MIN = 5;
export const DISPUTES_TO_HIDE = 3;
export const WARNING_METRES = 250;
export const REPORT_KEEP_DAYS = 400;
export const CELL_CAP = 20_000;
export const LESSON_USERS = 8;
export const CHECKPOINT_POLICY =
  "Police checkpoint locations are not collected, not shown, and never change a route.";

const REFUSED_KINDS = new Set(["checkpoint", "police", "camera", "speed_trap", "traffitech"]);
const ENFORCEMENT_NOTE = /\b(police|checkpoint|speed trap|traffitech|radar|speed camera)\b/i;

export interface ReportKind {
  id: string;
  label: string;
  ttlHours: number;
  detail: string;
}

export interface PlaceKind {
  id: string;
  label: string;
  group: string;
}

export interface CountryPack {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  bounds: { south: number; west: number; north: number; east: number };
  /** Clock buckets only. They are not a measurement of congestion. */
  rush: { days: number[]; startHour: number; endHour: number; label: string }[];
  holidays: { month: number; day: number; name: string }[];
  /** Easter and Farmers' Day are calculated. Lunar holidays are not guessed. */
  movable: ("easter" | "farmers_day")[];
  reportKinds: ReportKind[];
  placeKinds: PlaceKind[];
}

export const REPORT_KINDS: ReportKind[] = [
  { id: "accident", label: "Accident", ttlHours: 6, detail: "What a driver saw. Not an official incident." },
  { id: "closure", label: "Road closure", ttlHours: 48, detail: "A driver says the road is closed. Not an official closure." },
  { id: "flood", label: "Flooded road", ttlHours: 24, detail: "A driver saw water on the road. Not a flood forecast." },
  { id: "construction", label: "Construction", ttlHours: 24 * 14, detail: "A driver saw works. Not a works notice." },
  { id: "pothole", label: "Pothole", ttlHours: 24 * 60, detail: "A driver felt or saw a pothole." },
  { id: "signal", label: "Broken traffic light", ttlHours: 24 * 3, detail: "A driver says the signal is not working." },
  { id: "breakdown", label: "Vehicle breakdown", ttlHours: 3, detail: "A stopped vehicle a driver saw." },
  { id: "fallen_tree", label: "Fallen tree", ttlHours: 48, detail: "A driver saw a tree or branch in the road. Not an official closure." },
  { id: "surface", label: "Road surface", ttlHours: 24 * 60, detail: "How a driver described the surface. Not a rating of the road." },
  { id: "fuel_price", label: "Fuel price", ttlHours: 36, detail: "The price a driver typed. Not a station price list." },
  { id: "parking", label: "Parking", ttlHours: 2, detail: "What a driver saw. Not a live count of spaces." },
  { id: "debris", label: "Debris", ttlHours: 24, detail: "Something a driver saw in the road. Not an official closure." },
  { id: "animal", label: "Animal", ttlHours: 6, detail: "An animal a driver saw. Not a forecast." },
];

export const PLACE_KINDS: PlaceKind[] = [
  { id: "trotro_station", label: "Trotro station", group: "Transport" },
  { id: "taxi_rank", label: "Taxi rank", group: "Transport" },
  { id: "lorry_station", label: "Lorry station", group: "Transport" },
  { id: "rural_hub", label: "Rural transport hub", group: "Transport" },
  { id: "shop", label: "Shop", group: "Business" },
  { id: "restaurant", label: "Restaurant", group: "Business" },
  { id: "pharmacy", label: "Pharmacy", group: "Business" },
  { id: "school", label: "School", group: "Business" },
  { id: "church", label: "Church", group: "Business" },
  { id: "mosque", label: "Mosque", group: "Business" },
  { id: "toilet", label: "Public toilet", group: "Service" },
  { id: "market", label: "Market", group: "Business" },
  { id: "hospital", label: "Hospital", group: "Business" },
  { id: "atm", label: "ATM", group: "Service" },
  { id: "momo", label: "Mobile money agent", group: "Service" },
  { id: "fuel", label: "Fuel station", group: "Service" },
  { id: "parking", label: "Parking area", group: "Service" },
  { id: "ev_charge", label: "EV charging point", group: "Service" },
];

export const ghana: CountryPack = {
  id: "gh",
  name: "Ghana",
  timezone: "Africa/Accra",
  currency: "GHS",
  bounds: { south: 4.5, west: -3.4, north: 11.2, east: 1.3 },
  rush: [
    { days: [1, 2, 3, 4, 5], startHour: 6, endHour: 9, label: "weekday morning" },
    { days: [1, 2, 3, 4, 5], startHour: 16, endHour: 19, label: "weekday evening" },
  ],
  holidays: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 1, day: 7, name: "Constitution Day" },
    { month: 3, day: 6, name: "Independence Day" },
    { month: 5, day: 1, name: "May Day" },
    { month: 5, day: 25, name: "African Union Day" },
    { month: 7, day: 1, name: "Republic Day" },
    { month: 12, day: 25, name: "Christmas Day" },
    { month: 12, day: 26, name: "Boxing Day" },
  ],
  movable: ["easter", "farmers_day"],
  reportKinds: REPORT_KINDS,
  placeKinds: PLACE_KINDS,
};

const packs = new Map<string, CountryPack>([[ghana.id, ghana]]);

export function registerCountry(pack: CountryPack): CountryPack {
  const reportKinds = pack.reportKinds.filter((kind) => !REFUSED_KINDS.has(kind.id));
  const stored = { ...pack, reportKinds };
  packs.set(pack.id, stored);
  return stored;
}

export function countryById(id: string): CountryPack | null {
  return packs.get(id) ?? null;
}

export function forgetCountry(id: string): void {
  if (id === ghana.id) return;
  packs.delete(id);
}

export function countries(): CountryPack[] {
  return [...packs.values()];
}

export interface FieldState {
  consents: FieldConsentRecord[];
  cells: RoadCellRecord[];
  reports: FieldReportRecord[];
  places: CommunityPlaceRecord[];
  standing: ReporterStandingRecord[];
  events: FieldEventRecord[];
  folds: string[];
  /** Report kinds that need two other people before they are confirmed. */
  bars: string[];
}

export function fieldFromDatabase(db: Database): FieldState {
  return {
    consents: db.fieldConsents,
    cells: db.roadCells,
    reports: db.fieldReports,
    places: db.communityPlaces,
    standing: db.reporterStanding,
    events: db.fieldEvents,
    folds: db.fieldFolds,
    bars: (db.lessons ?? []).filter((lesson) => lesson.id.startsWith("report:") && lesson.users.length >= LESSON_USERS).map((lesson) => lesson.id.slice("report:".length)),
  };
}

export function blankField(): FieldState {
  return { consents: [], cells: [], reports: [], places: [], standing: [], events: [], folds: [], bars: [] };
}

export type FieldResult = { ok: true; id: string; status: string; message: string } | { ok: false; message: string };

export interface DriveContribution {
  sessionId: string;
  userId: string;
  at: string;
  meanSpeedKph: number | null;
  points: { lat: number; lng: number }[];
  raining: boolean;
  simulated: boolean;
  demo: boolean;
}

export interface SpeedReading {
  status: "ready" | "insufficient";
  meanKph: number | null;
  samples: number;
  reporters: number;
  requiredSamples: number;
  requiredReporters: number;
  source: "CALCULATED";
  note: string;
}

export interface PublicReport {
  id: string;
  kind: string;
  label: string;
  note: string;
  lat: number;
  lng: number;
  status: "open" | "confirmed";
  confirmations: number;
  confidence: number;
  priceGhs: number | null;
  source: "USER_PROVIDED";
  detail: string;
}

export interface PublicPlace {
  id: string;
  kind: string;
  label: string;
  name: string;
  note: string;
  lat: number;
  lng: number;
  confirmations: number;
  phone: string;
  hours: string;
  services: string;
  source: "USER_PROVIDED";
}

export interface FieldCensus {
  publishedSpeeds: number;
  sampledCells: number;
  openReports: number;
  confirmedReports: number;
  confirmedPlaces: number;
  driversSharing: number;
  source: "CALCULATED";
  note: string;
}

export function cellKey(lat: number, lng: number): string {
  return `${(Math.round(lat * 1000) / 1000).toFixed(3)},${(Math.round(lng * 1000) / 1000).toFixed(3)}`;
}

export function insideCountry(pack: CountryPack, lat: number, lng: number): boolean {
  return lat >= pack.bounds.south && lat <= pack.bounds.north && lng >= pack.bounds.west && lng <= pack.bounds.east;
}

export function holidayName(pack: CountryPack, year: number, month: number, day: number): string | null {
  const fixed = pack.holidays.find((item) => item.month === month && item.day === day);
  if (fixed) return fixed.name;
  if (pack.movable.includes("easter")) {
    const easter = easterSunday(year);
    if (month === easter.month && day === easter.day - 2) return "Good Friday";
    if (month === easter.month && day === easter.day) return "Easter Sunday";
    const monday = addCalendarDays(year, easter.month, easter.day, 1);
    if (month === monday.month && day === monday.day) return "Easter Monday";
    const friday = addCalendarDays(year, easter.month, easter.day, -2);
    if (month === friday.month && day === friday.day) return "Good Friday";
  }
  if (pack.movable.includes("farmers_day") && month === 12 && day === firstWeekday(year, 12, 5)) return "Farmers' Day";
  return null;
}

export function rushLabel(pack: CountryPack, when: Date): string | null {
  const clock = zoned(when, pack.timezone);
  const window = pack.rush.find((item) => item.days.includes(clock.dow) && clock.hour >= item.startHour && clock.hour < item.endHour);
  return window?.label ?? null;
}

export function consentFor(state: FieldState, userId: string, country: string): boolean {
  return state.consents.find((row) => row.userId === userId && row.country === country)?.sharing === true;
}

export function setSharing(state: FieldState, userId: string, country: string, sharing: boolean, now: Date): void {
  const row = state.consents.find((item) => item.userId === userId && item.country === country);
  if (row) {
    row.sharing = sharing;
    row.updatedAt = now.toISOString();
    return;
  }
  state.consents.push({ userId, country, sharing, updatedAt: now.toISOString() });
}

export function standingScore(row: Pick<ReporterStandingRecord, "confirmedByOthers" | "hidden">): number {
  return Math.max(-20, Math.min(20, row.confirmedByOthers * 4 - row.hidden * 6));
}

/** This account's own reports. It is not a rank other drivers see, and it does not describe the check. */
export function ownStandingNote(row: Pick<ReporterStandingRecord, "submitted" | "confirmedByOthers" | "hidden"> | undefined): string {
  if (!row || row.submitted === 0) return "You have not sent a report yet. This is not a public rank.";
  return `You have sent ${row.submitted}. This is not a public rank.`;
}

export function reportConfidence(report: FieldReportRecord, score: number, now: Date, ttlHours: number): number {
  if (report.status === "hidden" || report.status === "expired" || report.status === "held") return 0;
  const ageH = Math.max(0, (now.getTime() - new Date(report.createdAt).getTime()) / 3_600_000);
  const decay = Math.min(1, ageH / Math.max(1, ttlHours));
  let value = 25 + Math.min(3, report.confirmations.length) * 20 - Math.min(3, report.disputes.length) * 25;
  value += Math.max(0, Math.min(15, score));
  value *= 1 - 0.5 * decay;
  if (report.confirmations.length === 0) value = Math.min(value, 40);
  if (report.confirmations.length >= 1 && report.disputes.length === 0) value = Math.max(value, 70);
  return Math.round(Math.max(0, Math.min(CONFIDENCE_CAP, value)));
}

export function submitReport(
  state: FieldState,
  input: { id: string; userId: string; country: string; kind: string; lat: number; lng: number; note: string; priceGhs: number | null; createdAt: string },
): FieldResult {
  if (REFUSED_KINDS.has(input.kind)) return { ok: false, message: CHECKPOINT_POLICY };
  const pack = countryById(input.country);
  if (!pack) return { ok: false, message: "That country is not in the engine yet." };
  const kind = pack.reportKinds.find((item) => item.id === input.kind);
  if (!kind) return { ok: false, message: "That report is not one this country collects." };
  if (!insideCountry(pack, input.lat, input.lng)) return { ok: false, message: `Reports stay inside ${pack.name}.` };
  const note = cleanNote(input.note);
  if (isEvasionRequest(note) || ENFORCEMENT_NOTE.test(note)) {
    return { ok: false, message: "A report cannot be used to locate enforcement." };
  }
  const now = new Date(input.createdAt);
  const recent = state.reports.filter((row) => row.reporterId === input.userId && now.getTime() - new Date(row.createdAt).getTime() < 3_600_000);
  if (recent.length >= REPORTS_PER_HOUR) return { ok: false, message: "Too many reports in an hour. Try again later." };
  const burst = recent.filter((row) => now.getTime() - new Date(row.createdAt).getTime() < 600_000);
  if (burst.length >= BURST_PER_10_MIN) return { ok: false, message: "Those reports came in too quickly to accept." };
  const cell = cellKey(input.lat, input.lng);
  const duplicate = state.reports.find((row) => row.reporterId === input.userId && row.kind === kind.id && row.cell === cell && now.getTime() - new Date(row.createdAt).getTime() < 20 * 60_000 && row.status !== "expired");
  if (duplicate) return { ok: false, message: "You already reported this here." };
  const sameNote = note.length > 0 && state.reports.filter((row) => row.reporterId === input.userId && row.note.toLowerCase() === note.toLowerCase() && now.getTime() - new Date(row.createdAt).getTime() < 86_400_000).length >= 4;
  if (sameNote) return { ok: false, message: "The same note has been sent too many times today." };
  let price: number | null = null;
  if (kind.id === "fuel_price") {
    if (input.priceGhs == null || !Number.isFinite(input.priceGhs) || input.priceGhs < 1 || input.priceGhs > 40) {
      return { ok: false, message: "Enter the price per litre you saw, between 1 and 40." };
    }
    price = Math.round(input.priceGhs * 10) / 10;
  }
  const standing = ensureStanding(state, input.userId);
  standing.submitted += 1;
  const report: FieldReportRecord = {
    id: input.id,
    country: pack.id,
    kind: kind.id,
    lat: input.lat,
    lng: input.lng,
    cell,
    reporterId: input.userId,
    note,
    priceGhs: price,
    createdAt: input.createdAt,
    confirmations: [],
    disputes: [],
    status: "open",
    credited: false,
    penalised: false,
    source: "USER_PROVIDED",
  };
  report.status = decideStatus(state, report);
  state.reports.push(report);
  credit(state, report);
  const published = report.status === "open" || report.status === "confirmed";
  return {
    ok: true,
    id: report.id,
    status: report.status,
    message: published
      ? "Saved. It is not on the shared roads yet."
      : "Saved. It is not on a route yet.",
  };
}

export function confirmReport(state: FieldState, reportId: string, userId: string, now: Date): FieldResult {
  const report = state.reports.find((row) => row.id === reportId);
  if (!report || report.status === "expired" || report.status === "hidden") return { ok: false, message: "That report is no longer open." };
  if (report.reporterId === userId) return { ok: false, message: "That was not accepted." };
  if (report.confirmations.includes(userId)) return { ok: false, message: "That was not accepted." };
  report.disputes = report.disputes.filter((id) => id !== userId);
  report.confirmations.push(userId);
  report.status = freshStatus(state, report, now);
  credit(state, report);
  return { ok: true, id: report.id, status: report.status, message: "Saved." };
}

export function disputeReport(state: FieldState, reportId: string, userId: string, now: Date): FieldResult {
  const report = state.reports.find((row) => row.id === reportId);
  if (!report || report.status === "expired") return { ok: false, message: "That report is no longer open." };
  if (report.reporterId === userId) return { ok: false, message: "That was not accepted." };
  if (report.disputes.includes(userId)) return { ok: false, message: "That was not accepted." };
  report.confirmations = report.confirmations.filter((id) => id !== userId);
  report.disputes.push(userId);
  report.status = freshStatus(state, report, now);
  credit(state, report);
  return { ok: true, id: report.id, status: report.status, message: "Saved." };
}

/** A report about a place already stored. The status changes only after this check. */
export function reportPlace(state: FieldState, input: { placeId: string; userId: string; reason: string; note: string }): FieldResult {
  const place = state.places.find((row) => row.id === input.placeId);
  if (!place || place.status === "hidden") return { ok: false, message: "That was not accepted." };
  if (place.reporterId === input.userId) return { ok: false, message: "That was not accepted." };
  if (input.reason !== "gone" && input.reason !== "wrong" && input.reason !== "offensive") return { ok: false, message: "That was not accepted." };
  const note = cleanNote(input.note);
  if (isEvasionRequest(`${input.reason} ${note}`) || ENFORCEMENT_NOTE.test(note)) return { ok: false, message: "That was not accepted." };
  if (place.disputes.includes(input.userId)) return { ok: false, message: "That was not accepted." };
  place.confirmations = place.confirmations.filter((id) => id !== input.userId);
  place.disputes.push(input.userId);
  if (place.disputes.length >= DISPUTES_TO_HIDE && place.disputes.length > place.confirmations.length) place.status = "hidden";
  else if (input.reason === "wrong" && place.disputes.length > place.confirmations.length && place.status === "confirmed") {
    place.status = "open";
    place.confirmations = [];
  }
  return { ok: true, id: place.id, status: place.status, message: "Saved." };
}

/** A request is kept or refused. Keeping one does not add a feature or change a route. */
export function submitAsk(asks: AskRecord[], input: { id: string; userId: string; text: string; createdAt: string }): FieldResult {
  const text = cleanNote(input.text);
  if (text.length < 8) return { ok: false, message: "That was not accepted." };
  if (isEvasionRequest(text) || ENFORCEMENT_NOTE.test(text)) return { ok: false, message: "That was not accepted." };
  const now = new Date(input.createdAt).getTime();
  if (!Number.isFinite(now)) return { ok: false, message: "That was not accepted." };
  const mine = asks.filter((row) => row.userId === input.userId && now - new Date(row.createdAt).getTime() < 86_400_000);
  if (mine.length >= 3 || mine.some((row) => row.text.toLowerCase() === text.toLowerCase())) return { ok: false, message: "That was not accepted." };
  asks.push({ id: input.id, userId: input.userId, text, createdAt: input.createdAt });
  if (asks.length > 200) asks.splice(0, asks.length - 200);
  return { ok: true, id: input.id, status: "kept", message: "Saved." };
}

export function placeServices(value: string): string | null {
  const services = value.trim().slice(0, 80);
  if (/[<>]/.test(services)) return null;
  return services;
}

export function submitPlace(
  state: FieldState,
  input: { id: string; userId: string; country: string; kind: string; name: string; note: string; lat: number; lng: number; createdAt: string; phone?: string; hours?: string; services?: string },
): FieldResult {
  const pack = countryById(input.country);
  if (!pack) return { ok: false, message: "That country is not in the engine yet." };
  const kind = pack.placeKinds.find((item) => item.id === input.kind);
  if (!kind) return { ok: false, message: "That place is not one this country collects." };
  if (!insideCountry(pack, input.lat, input.lng)) return { ok: false, message: `Places stay inside ${pack.name}.` };
  const name = cleanName(input.name);
  if (name.length < 2) return { ok: false, message: "Name the place." };
  const note = cleanNote(input.note);
  const phone = placePhone(input.phone ?? "");
  if (phone == null) return { ok: false, message: "Enter a phone number, or leave it empty." };
  const hours = placeHours(input.hours ?? "");
  if (hours == null) return { ok: false, message: "Those hours could not be kept. Leave the field empty, or write the hours without symbols." };
  const services = placeServices(input.services ?? "");
  if (services == null) return { ok: false, message: "The services could not be kept. Leave the field empty, or write them without symbols." };
  if ([note, hours, services, name].some((value) => isEvasionRequest(value) || ENFORCEMENT_NOTE.test(value))) {
    return { ok: false, message: "A place cannot be used to locate enforcement." };
  }
  const place: CommunityPlaceRecord = {
    id: input.id,
    country: pack.id,
    kind: kind.id,
    name,
    note,
    phone,
    hours,
    services,
    lat: input.lat,
    lng: input.lng,
    cell: cellKey(input.lat, input.lng),
    reporterId: input.userId,
    createdAt: input.createdAt,
    confirmations: [],
    disputes: [],
    status: "open",
    source: "USER_PROVIDED",
  };
  state.places.push(place);
  return { ok: true, id: place.id, status: place.status, message: "Saved. Other drivers do not see it yet." };
}

export function editPlace(
  state: FieldState,
  input: { id: string; userId: string; name: string; note: string; phone?: string; hours?: string; services?: string },
): FieldResult {
  const place = state.places.find((row) => row.id === input.id);
  if (!place || place.status === "hidden") return { ok: false, message: "That place is not open." };
  if (place.reporterId !== input.userId) return { ok: false, message: "You can edit a place you added." };
  const name = cleanName(input.name);
  if (name.length < 2) return { ok: false, message: "Name the place." };
  const note = cleanNote(input.note);
  const phone = placePhone(input.phone ?? "");
  if (phone == null) return { ok: false, message: "Enter a phone number, or leave it empty." };
  const hours = placeHours(input.hours ?? "");
  if (hours == null) return { ok: false, message: "Those hours could not be kept. Leave the field empty, or write the hours without symbols." };
  const services = placeServices(input.services ?? "");
  if (services == null) return { ok: false, message: "The services could not be kept. Leave the field empty, or write them without symbols." };
  if ([note, hours, services, name].some((value) => isEvasionRequest(value) || ENFORCEMENT_NOTE.test(value))) {
    return { ok: false, message: "A place cannot be used to locate enforcement." };
  }
  const wasConfirmed = place.status === "confirmed";
  place.name = name;
  place.note = note;
  place.phone = phone;
  place.hours = hours;
  place.services = services;
  if (wasConfirmed) {
    place.status = "open";
    place.confirmations = [];
  }
  return { ok: true, id: place.id, status: place.status, message: "Saved." };
}

export function confirmPlace(state: FieldState, placeId: string, userId: string): FieldResult {
  const place = state.places.find((row) => row.id === placeId);
  if (!place || place.status === "hidden") return { ok: false, message: "That place is not open." };
  if (place.reporterId === userId) return { ok: false, message: "That was not accepted." };
  if (!place.confirmations.includes(userId)) place.confirmations.push(userId);
  place.disputes = place.disputes.filter((id) => id !== userId);
  place.status = place.confirmations.length >= 1 && place.disputes.length < place.confirmations.length ? "confirmed" : place.status;
  return { ok: true, id: place.id, status: place.status, message: place.status === "confirmed" ? "Other drivers can now see this place." : "Your confirmation is counted." };
}

export function submitEvent(
  state: FieldState,
  input: { id: string; userId: string; country: string; name: string; lat: number; lng: number; startsAt: string; endsAt: string },
): FieldResult {
  const pack = countryById(input.country);
  if (!pack) return { ok: false, message: "That country is not in the engine yet." };
  if (!insideCountry(pack, input.lat, input.lng)) return { ok: false, message: `Events stay inside ${pack.name}.` };
  const name = cleanName(input.name);
  if (name.length < 2) return { ok: false, message: "Name the event." };
  const start = new Date(input.startsAt).getTime();
  const end = new Date(input.endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 14 * 86_400_000) {
    return { ok: false, message: "An event needs a start and an end, at most 14 days apart." };
  }
  const event: FieldEventRecord = {
    id: input.id,
    country: pack.id,
    name,
    lat: input.lat,
    lng: input.lng,
    cell: cellKey(input.lat, input.lng),
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    reporterId: input.userId,
    confirmations: [],
    status: "open",
    source: "USER_PROVIDED",
  };
  state.events.push(event);
  return { ok: true, id: event.id, status: "open", message: "Saved. It is not in use yet." };
}

export function confirmEvent(state: FieldState, eventId: string, userId: string): FieldResult {
  const event = state.events.find((row) => row.id === eventId);
  if (!event) return { ok: false, message: "That event is not saved." };
  if (event.reporterId === userId) return { ok: false, message: "That was not accepted." };
  if (!event.confirmations.includes(userId)) event.confirmations.push(userId);
  event.status = "confirmed";
  return { ok: true, id: event.id, status: "confirmed", message: "Confirmed. Drives shared during it can be read separately." };
}

export function absorbDrive(state: FieldState, drive: DriveContribution): boolean {
  if (state.folds.includes(drive.sessionId)) return false;
  if (drive.simulated || drive.demo || drive.meanSpeedKph == null || drive.points.length < 2) {
    state.folds.push(drive.sessionId);
    return true;
  }
  const consent = state.consents.find((row) => row.userId === drive.userId && row.sharing);
  if (!consent) return false;
  const pack = countryById(consent.country);
  if (!pack) return false;
  const when = new Date(drive.at);
  const clock = zoned(when, pack.timezone);
  const holiday = holidayName(pack, clock.year, clock.month, clock.day);
  const speed = Math.round(drive.meanSpeedKph);
  if (speed < 5 || speed > 180) {
    state.folds.push(drive.sessionId);
    return true;
  }
  const counts = new Map<string, number>();
  for (const point of drive.points) {
    if (!insideCountry(pack, point.lat, point.lng)) continue;
    const cell = cellKey(point.lat, point.lng);
    const used = counts.get(cell) ?? 0;
    if (used >= SAMPLES_PER_DRIVE) continue;
    counts.set(cell, used + 1);
    addShare(state, pack, cell, "hour", clock.dow, clock.hour, "", "", speed, drive.userId, drive.at);
    if (drive.raining) addShare(state, pack, cell, "rain", clock.dow, clock.hour, "", "", speed, drive.userId, drive.at);
    if (holiday) addShare(state, pack, cell, "holiday", clock.dow, clock.hour, holiday, "", speed, drive.userId, drive.at);
    const event = confirmedEventAt(state, pack.id, cell, when);
    if (event) addShare(state, pack, cell, "event", clock.dow, clock.hour, "", event.id, speed, drive.userId, drive.at);
  }
  state.folds.push(drive.sessionId);
  return true;
}

export function withdrawUser(state: FieldState, userId: string): { removedReports: number; removedPlaces: number } {
  for (const consent of state.consents) {
    if (consent.userId === userId) consent.sharing = false;
  }
  let removedReports = 0;
  for (let index = state.reports.length - 1; index >= 0; index -= 1) {
    const report = state.reports[index];
    if (report.reporterId !== userId) continue;
    if (report.status === "confirmed") report.reporterId = "";
    else {
      state.reports.splice(index, 1);
      removedReports += 1;
    }
  }
  for (const report of state.reports) {
    report.confirmations = report.confirmations.filter((id) => id !== userId);
    report.disputes = report.disputes.filter((id) => id !== userId);
  }
  let removedPlaces = 0;
  for (let index = state.places.length - 1; index >= 0; index -= 1) {
    const place = state.places[index];
    if (place.reporterId === userId && place.status !== "confirmed") {
      state.places.splice(index, 1);
      removedPlaces += 1;
    }
  }
  for (const place of state.places) place.confirmations = place.confirmations.filter((id) => id !== userId);
  for (let index = state.events.length - 1; index >= 0; index -= 1) {
    const event = state.events[index];
    if (event.reporterId === userId && event.status !== "confirmed") state.events.splice(index, 1);
  }
  for (const cell of state.cells) {
    cell.shares = cell.shares.filter((share) => share.userId !== userId);
    cell.samples = cell.shares.reduce((sum, share) => sum + share.samples, 0);
    cell.speedSum = cell.shares.reduce((sum, share) => sum + share.speedSum, 0);
  }
  for (let index = state.cells.length - 1; index >= 0; index -= 1) {
    if (state.cells[index].samples <= 0) state.cells.splice(index, 1);
  }
  for (let index = state.standing.length - 1; index >= 0; index -= 1) {
    if (state.standing[index].userId === userId) state.standing.splice(index, 1);
  }
  return { removedReports, removedPlaces };
}

export function advanceField(db: Database, now: Date): boolean {
  let changed = false;
  const state = fieldFromDatabase(db);
  for (const report of state.reports) {
    const next = freshStatus(state, report, now);
    if (next !== report.status) {
      report.status = next;
      changed = true;
    }
    if (credit(state, report)) changed = true;
  }
  const cutoff = now.getTime() - REPORT_KEEP_DAYS * 86_400_000;
  const kept = state.reports.filter((report) => new Date(report.createdAt).getTime() >= cutoff);
  if (kept.length !== state.reports.length) {
    db.fieldReports = kept;
    changed = true;
  }
  if (state.cells.length > CELL_CAP) {
    const ranked = [...state.cells].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, CELL_CAP);
    db.roadCells = ranked;
    changed = true;
  }
  return changed;
}

export function refreshReports(db: Database, now: Date): boolean {
  let changed = false;
  const state = fieldFromDatabase(db);
  for (const report of state.reports) {
    const next = freshStatus(state, report, now);
    if (next !== report.status) {
      report.status = next;
      changed = true;
    }
    if (credit(state, report)) changed = true;
  }
  return changed;
}

export function readCell(state: FieldState, cell: string, when: Date, raining: boolean): SpeedReading {
  return predictSpeed(state, "gh", cell, when, raining ? "rain" : "any");
}

export function predictSpeed(state: FieldState, countryId: string, cell: string, when: Date, weather: "any" | "rain"): SpeedReading {
  const pack = countryById(countryId);
  if (!pack) return insufficient(0, 0, "That country is not in the engine yet.");
  const clock = zoned(when, pack.timezone);
  const holiday = holidayName(pack, clock.year, clock.month, clock.day);
  if (holiday) {
    const row = findCell(state, pack.id, cell, "holiday", holiday, "");
    const reading = readingFrom(row, `This date is ${holiday}.`);
    if (reading.status === "insufficient") {
      return { ...reading, note: `This date is ${holiday}. There are not enough shared drives from that holiday on this road.` };
    }
    return { ...reading, note: `Calculated from shared drives on ${holiday}. It is not a live travel time.` };
  }
  if (weather === "rain") {
    const row = state.cells.find((item) => item.country === pack.id && item.cell === cell && item.kind === "rain" && item.dow === clock.dow && item.hour === clock.hour);
    const reading = readingFrom(row, "Rain.");
    if (reading.status === "insufficient") {
      return { ...reading, note: "Rain-related speeds are not known on this road. There is no weather feed." };
    }
    return { ...reading, note: "Calculated from drives those drivers marked as rain. It is not a weather service." };
  }
  const row = state.cells.find((item) => item.country === pack.id && item.cell === cell && item.kind === "hour" && item.dow === clock.dow && item.hour === clock.hour);
  const reading = readingFrom(row, "This hour.");
  if (reading.status === "insufficient") {
    return { ...reading, note: "Not enough drivers have shared this road at this hour." };
  }
  return { ...reading, note: "Calculated from drivers who chose to share. This is not live traffic." };
}

export function predictRush(state: FieldState, countryId: string, cell: string, when: Date): SpeedReading {
  const pack = countryById(countryId);
  if (!pack) return insufficient(0, 0, "That country is not in the engine yet.");
  const label = rushLabel(pack, when);
  if (!label) return insufficient(0, 0, "This time is outside the rush windows in the country pack. A rush window is a clock bucket, not a measurement.");
  const clock = zoned(when, pack.timezone);
  const window = pack.rush.find((item) => item.label === label && item.days.includes(clock.dow));
  if (!window) return insufficient(0, 0, "This time is outside the rush windows in the country pack.");
  let samples = 0;
  let speedSum = 0;
  let reporters = new Set<string>();
  let hoursReady = 0;
  for (let hour = window.startHour; hour < window.endHour; hour += 1) {
    const row = state.cells.find((item) => item.country === pack.id && item.cell === cell && item.kind === "hour" && item.dow === clock.dow && item.hour === hour);
    if (!row || row.samples < SPEED_MIN_SAMPLES || row.shares.length < SPEED_MIN_REPORTERS) continue;
    hoursReady += 1;
    samples += row.samples;
    speedSum += row.speedSum;
    for (const share of row.shares) reporters.add(share.userId);
  }
  if (hoursReady === 0) {
    return insufficient(0, 0, `This is the ${label} window. Not enough drivers have shared this road in that window.`);
  }
  return {
    status: "ready",
    meanKph: Math.round(speedSum / samples),
    samples,
    reporters: reporters.size,
    requiredSamples: SPEED_MIN_SAMPLES,
    requiredReporters: SPEED_MIN_REPORTERS,
    source: "CALCULATED",
    note: `Calculated from shared drives in the ${label} window, across ${hoursReady} hour${hoursReady === 1 ? "" : "s"} with enough samples. A rush window is not itself a measurement, and this is not live traffic.`,
  };
}

export function predictEvent(state: FieldState, countryId: string, cell: string, when: Date): SpeedReading {
  const event = confirmedEventAt(state, countryId, cell, when);
  if (!event) return insufficient(0, 0, "No confirmed event is saved for this place at this time.");
  const row = state.cells.find((item) => item.kind === "event" && item.eventId === event.id && item.cell === cell);
  const reading = readingFrom(row, event.name);
  if (reading.status === "insufficient") {
    return { ...reading, note: `${event.name} is confirmed by drivers. Not enough drives were shared during it.` };
  }
  return { ...reading, note: `Calculated from drives shared during ${event.name}. It is not a prediction from a ticket seller.` };
}

export function fieldCensus(state: FieldState, countryId: string): FieldCensus {
  const cells = new Set<string>();
  const published = new Set<string>();
  for (const cell of state.cells) {
    if (cell.country !== countryId || cell.kind !== "hour") continue;
    cells.add(cell.cell);
    if (cell.samples >= SPEED_MIN_SAMPLES && cell.shares.length >= SPEED_MIN_REPORTERS) published.add(cell.cell);
  }
  const reports = state.reports.filter((row) => row.country === countryId);
  return {
    publishedSpeeds: published.size,
    sampledCells: cells.size,
    openReports: reports.filter((row) => row.status === "open").length,
    confirmedReports: reports.filter((row) => row.status === "confirmed").length,
    confirmedPlaces: state.places.filter((row) => row.country === countryId && row.status === "confirmed").length,
    driversSharing: state.consents.filter((row) => row.country === countryId && row.sharing).length,
    source: "CALCULATED",
    note: "These counts are rows already stored. They are not a claim about how many people use Nokware, and they are not live traffic.",
  };
}

export function publicReports(state: FieldState, countryId: string, now: Date, point?: { lat: number; lng: number }, radiusM = 2_000): PublicReport[] {
  const pack = countryById(countryId);
  if (!pack) return [];
  return state.reports
    .filter((report) => report.country === countryId && (report.status === "open" || report.status === "confirmed"))
    .filter((report) => !point || metres(point, { lat: report.lat, lng: report.lng }) <= radiusM)
    .map((report) => toPublic(report, pack, now, standingScore(standingOf(state, report.reporterId))))
    .filter((report) => report.confidence > 0)
    .slice(0, 40);
}

export function publicPlaces(state: FieldState, countryId: string, point?: { lat: number; lng: number }, radiusM = 3_000): PublicPlace[] {
  const pack = countryById(countryId);
  if (!pack) return [];
  return state.places
    .filter((place) => place.country === countryId && place.status === "confirmed")
    .filter((place) => !point || metres(point, { lat: place.lat, lng: place.lng }) <= radiusM)
    .slice(0, 40)
    .map((place) => ({
      id: place.id,
      kind: place.kind,
      label: pack.placeKinds.find((item) => item.id === place.kind)?.label ?? place.kind,
      name: place.name,
      note: place.note,
      lat: Number(cellKey(place.lat, place.lng).split(",")[0]),
      lng: Number(cellKey(place.lat, place.lng).split(",")[1]),
      confirmations: place.confirmations.length,
      phone: place.phone ?? "",
      hours: place.hours ?? "",
      services: place.services ?? "",
      source: "USER_PROVIDED" as const,
    }));
}

export function fuelPriceNote(reports: FieldReportRecord[], point: { lat: number; lng: number }, now: Date): string | null {
  let best: { price: number; at: string; distance: number } | null = null;
  for (const report of reports) {
    if (report.kind !== "fuel_price" || report.status !== "confirmed" || report.priceGhs == null) continue;
    if (now.getTime() - new Date(report.createdAt).getTime() > 36 * 3_600_000) continue;
    const distance = metres(point, { lat: report.lat, lng: report.lng });
    if (distance > 400) continue;
    if (!best || distance < best.distance) best = { price: report.priceGhs, at: report.createdAt, distance };
  }
  if (!best) return null;
  return `A driver typed GH₵ ${best.price.toFixed(1)} per litre on ${formatDay(best.at)}. Not a station price list.`;
}

export function routeWarnings(geometry: { lat: number; lng: number }[], reports: FieldReportRecord[], now: Date): { label: string; source: "USER_PROVIDED" }[] {
  const warnings: { label: string; source: "USER_PROVIDED" }[] = [];
  const wanted = new Set(["accident", "closure", "flood", "construction", "fallen_tree", "debris", "animal"]);
  for (const report of reports) {
    if (report.status !== "confirmed" || !wanted.has(report.kind)) continue;
    const pack = countryById(report.country);
    const ttl = pack?.reportKinds.find((item) => item.id === report.kind)?.ttlHours ?? 24;
    if (now.getTime() - new Date(report.createdAt).getTime() > ttl * 3_600_000) continue;
    const near = geometry.some((point) => metres(point, { lat: report.lat, lng: report.lng }) <= WARNING_METRES);
    if (!near) continue;
    const label = pack?.reportKinds.find((item) => item.id === report.kind)?.label ?? report.kind;
    warnings.push({
      label: `Drivers confirmed a ${label.toLowerCase()} near this route. The route order is unchanged. This is not an official notice.`,
      source: "USER_PROVIDED",
    });
    if (warnings.length >= 3) break;
  }
  return warnings;
}

export function partnerSlots(): { sector: string; status: "not_connected"; note: string }[] {
  return [
    { sector: "Ride-hailing", status: "not_connected", note: "No ride-hailing company is connected. Nothing is received from one." },
    { sector: "Delivery", status: "not_connected", note: "No delivery company is connected." },
    { sector: "Logistics", status: "not_connected", note: "No logistics firm is connected." },
    { sector: "Bus operators", status: "not_connected", note: "No bus operator is connected. A trotro station can still be added by a driver." },
    { sector: "Government", status: "not_connected", note: "No ministry or assembly feed is connected." },
    { sector: "Universities", status: "not_connected", note: "No university feed is connected." },
    { sector: "Telecoms", status: "not_connected", note: "No telecom feed is connected." },
  ];
}

export function revenueDesk(): { name: string; state: "available" | "partial" | "not_connected"; detail: string }[] {
  return [
    { name: "Business listings", state: "available", detail: "A driver can add a place. There is no rating and no open-now flag." },
    { name: "Featured businesses", state: "not_connected", detail: "Featuring a business would need checkout. Checkout is not connected, and no business is featured." },
    { name: "Fleet tools", state: "available", detail: "A fleet account keeps the drivers and vehicles its owner entered." },
    { name: "Delivery API", state: "not_connected", detail: "No outside service can post jobs." },
    { name: "Traffic analytics", state: "partial", detail: "The counts on Local roads are calculated from shared samples and reports. They are not a live traffic dashboard." },
  ];
}

export function affectsRouteRank(): false {
  return false;
}

function toPublic(report: FieldReportRecord, pack: CountryPack, now: Date, score: number): PublicReport {
  const kind = pack.reportKinds.find((item) => item.id === report.kind);
  const [lat, lng] = cellKey(report.lat, report.lng).split(",").map(Number);
  return {
    id: report.id,
    kind: report.kind,
    label: kind?.label ?? report.kind,
    note: report.note,
    lat,
    lng,
    status: report.status === "confirmed" ? "confirmed" : "open",
    confirmations: report.confirmations.length,
    confidence: reportConfidence(report, score, now, kind?.ttlHours ?? 24),
    priceGhs: report.priceGhs,
    source: "USER_PROVIDED",
    detail: kind?.detail ?? "A driver report.",
  };
}

function readingFrom(row: RoadCellRecord | undefined, prefix: string): SpeedReading {
  const samples = row?.samples ?? 0;
  const reporters = row?.shares.length ?? 0;
  if (!row || samples < SPEED_MIN_SAMPLES || reporters < SPEED_MIN_REPORTERS) {
    return insufficient(samples, reporters, prefix);
  }
  return {
    status: "ready",
    meanKph: Math.round(row.speedSum / row.samples),
    samples,
    reporters,
    requiredSamples: SPEED_MIN_SAMPLES,
    requiredReporters: SPEED_MIN_REPORTERS,
    source: "CALCULATED",
    note: prefix,
  };
}

function insufficient(samples: number, reporters: number, note: string): SpeedReading {
  return {
    status: "insufficient",
    meanKph: null,
    samples,
    reporters,
    requiredSamples: SPEED_MIN_SAMPLES,
    requiredReporters: SPEED_MIN_REPORTERS,
    source: "CALCULATED",
    note,
  };
}

function findCell(state: FieldState, country: string, cell: string, kind: RoadCellRecord["kind"], holiday: string, eventId: string): RoadCellRecord | undefined {
  return state.cells.find((item) => item.country === country && item.cell === cell && item.kind === kind && item.holiday === holiday && item.eventId === eventId);
}

function addShare(state: FieldState, pack: CountryPack, cell: string, kind: RoadCellRecord["kind"], dow: number, hour: number, holiday: string, eventId: string, speed: number, userId: string, at: string): void {
  const id = [pack.id, cell, kind, kind === "holiday" ? holiday : kind === "event" ? eventId : `${dow}-${hour}`].join("|");
  let row = state.cells.find((item) => item.id === id);
  if (!row) {
    row = { id, country: pack.id, cell, kind, dow, hour, holiday, eventId, samples: 0, speedSum: 0, shares: [], updatedAt: at, source: "CALCULATED" };
    state.cells.push(row);
  }
  let share = row.shares.find((item) => item.userId === userId);
  if (!share) {
    if (row.shares.length >= SHARES_PER_CELL) return;
    share = { userId, samples: 0, speedSum: 0 };
    row.shares.push(share);
  }
  share.samples += 1;
  share.speedSum += speed;
  row.samples = row.shares.reduce((sum, item) => sum + item.samples, 0);
  row.speedSum = row.shares.reduce((sum, item) => sum + item.speedSum, 0);
  row.updatedAt = at;
}

function confirmedEventAt(state: FieldState, country: string, cell: string, when: Date): FieldEventRecord | null {
  const time = when.getTime();
  return state.events.find((event) => event.country === country && event.cell === cell && event.status === "confirmed" && time >= new Date(event.startsAt).getTime() && time <= new Date(event.endsAt).getTime()) ?? null;
}

function ensureStanding(state: FieldState, userId: string): ReporterStandingRecord {
  let row = state.standing.find((item) => item.userId === userId);
  if (!row) {
    row = { userId, submitted: 0, confirmedByOthers: 0, hidden: 0 };
    state.standing.push(row);
  }
  return row;
}

function standingOf(state: FieldState, userId: string): ReporterStandingRecord {
  return state.standing.find((item) => item.userId === userId) ?? { userId, submitted: 0, confirmedByOthers: 0, hidden: 0 };
}

function neededConfirmations(score: number): number {
  return score < 0 ? 2 : 1;
}

function priceOutlier(state: FieldState, report: FieldReportRecord): boolean {
  if (report.kind !== "fuel_price" || report.priceGhs == null) return false;
  const others = state.reports.filter((row) => row.id !== report.id && row.kind === "fuel_price" && row.cell === report.cell && row.priceGhs != null && row.confirmations.length > 0);
  if (others.length < 3) return false;
  const prices = others.map((row) => row.priceGhs ?? 0).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  return report.priceGhs > median * 1.5 || report.priceGhs < median * 0.67;
}

function decideStatus(state: FieldState, report: FieldReportRecord): FieldReportStatus {
  const score = standingScore(standingOf(state, report.reporterId));
  if (report.disputes.length >= DISPUTES_TO_HIDE && report.confirmations.length === 0) return "hidden";
  if (report.disputes.length >= 2 && report.disputes.length > report.confirmations.length) return "hidden";
  const need = Math.max(neededConfirmations(score), state.bars?.includes(report.kind) ? 2 : 1);
  if (priceOutlier(state, report) && report.confirmations.length < need) return "held";
  if (score <= -12 && report.confirmations.length < 2) return "held";
  if (report.confirmations.length >= need && report.confirmations.length > report.disputes.length) return "confirmed";
  return "open";
}

function freshStatus(state: FieldState, report: FieldReportRecord, now: Date): FieldReportStatus {
  if (report.status === "hidden") return "hidden";
  const pack = countryById(report.country);
  const ttl = pack?.reportKinds.find((item) => item.id === report.kind)?.ttlHours ?? 24;
  if (now.getTime() - new Date(report.createdAt).getTime() > ttl * 3_600_000) return "expired";
  return decideStatus(state, report);
}

function credit(state: FieldState, report: FieldReportRecord): boolean {
  if (!report.reporterId) return false;
  const standing = ensureStanding(state, report.reporterId);
  let changed = false;
  if (report.status === "confirmed" && !report.credited) {
    standing.confirmedByOthers += 1;
    report.credited = true;
    changed = true;
  }
  if (report.status === "hidden" && !report.penalised) {
    standing.hidden += 1;
    report.penalised = true;
    changed = true;
  }
  return changed;
}

function cleanNote(note: string): string {
  return note.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
}

function cleanName(name: string): string {
  return name.replace(/[^A-Za-z0-9 .'-]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}

function zoned(when: Date, timeZone: string): { year: number; month: number; day: number; hour: number; dow: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(when);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(read("weekday"));
  let hour = Number(read("hour"));
  if (hour === 24) hour = 0;
  return { year: Number(read("year")), month: Number(read("month")), day: Number(read("day")), hour, dow };
}

function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function addCalendarDays(year: number, month: number, day: number, delta: number): { month: number; day: number } {
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return { month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function firstWeekday(year: number, month: number, weekday: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7);
}

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
