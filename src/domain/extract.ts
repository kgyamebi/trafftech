import { accraToday, formatDay, isCalendarDate, isoDate } from "./dates";
import type { DocumentKind, DocumentReading } from "./types";

export type ResourceKind = "image" | "pdf" | "text" | "sheet" | "document" | "audio" | "video" | "unknown";

export interface PulledField {
  key: string;
  label: string;
  value: string;
  evidence: string;
  derived: boolean;
}

export interface PassLog {
  label: string;
  kept: number;
  dropped: number;
  fields: string[];
}

export interface Extraction {
  resource: ResourceKind;
  kept: string[];
  dropped: number;
  fields: PulledField[];
  suggestedKind: DocumentKind | null;
  suggestedExpiry: string | null;
  confidence: "high" | "partial" | "none";
  passes: number;
  missing: string[];
  disagreements: string[];
  passLog: PassLog[];
  decision: "accepted" | "refused";
  reasons: string[];
  note: string;
}

interface Candidate {
  key: string;
  label: string;
  value: string;
  evidence: string;
  derived: boolean;
  labelled: boolean;
}

const WORDS = [
  "insurance", "roadworthiness", "registration", "licence", "license", "certificate",
  "expiry", "expires", "expired", "policy", "vehicle", "chassis", "comprehensive",
  "ownership", "sticker", "premium", "insured", "holder", "insurer", "renewal",
  "valid", "issued", "reference", "number",
];

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const MONTH = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

const KIND_RULES: { kind: DocumentKind; re: RegExp; weight: number }[] = [
  { kind: "roadworthiness", re: /road\s*worthiness/i, weight: 3 },
  { kind: "sale_agreement", re: /sale agreement|bill of sale/i, weight: 3 },
  { kind: "licence", re: /\blicen[cs]e\b/i, weight: 3 },
  { kind: "insurance", re: /\binsurance\b|\bpolicy\b|\bcomprehensive\b|\bthird party\b/i, weight: 2 },
  { kind: "registration", re: /\bregistration\b/i, weight: 2 },
  { kind: "ownership", re: /\bownership\b/i, weight: 2 },
];

const FIELD_LABEL: Record<string, string> = {
  kind: "Document",
  holder: "Name",
  plate: "Plate",
  policy: "Policy",
  reference: "Reference",
  insurer: "Insurer",
  chassis: "Chassis",
  issued: "Issued",
  expires: "Expiry",
};

export function kindLabel(kind: DocumentKind | null): string {
  if (kind === "sale_agreement") return "Sale agreement";
  if (kind === "roadworthiness") return "Roadworthiness";
  if (kind === "insurance") return "Insurance";
  if (kind === "registration") return "Registration";
  if (kind === "ownership") return "Ownership";
  if (kind === "licence") return "Licence";
  return "Document";
}

export function resourceKind(name: string, mime: string): ResourceKind {
  const file = name.toLowerCase();
  if (mime.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/.test(file)) return "image";
  if (mime.startsWith("audio/") || /\.(mp3|wav|m4a|ogg)$/.test(file)) return "audio";
  if (mime.startsWith("video/") || /\.(mp4|webm|mov)$/.test(file)) return "video";
  if (mime === "application/pdf" || file.endsWith(".pdf")) return "pdf";
  if (file.endsWith(".docx") || mime.includes("wordprocessingml")) return "document";
  if (file.endsWith(".xlsx") || file.endsWith(".csv") || mime.includes("spreadsheet") || mime === "text/csv") return "sheet";
  if (mime.startsWith("text/") || file.endsWith(".txt") || file.endsWith(".json") || file.endsWith(".md")) return "text";
  return "unknown";
}

export function needsAnotherPass(result: Extraction, options?: { minPasses?: number; maxPasses?: number }): boolean {
  const minPasses = options?.minPasses ?? 1;
  const maxPasses = options?.maxPasses ?? 5;
  if (result.passes >= maxPasses) return false;
  if (result.passes < minPasses) return true;
  return result.confidence !== "high";
}

export function readingSummary(result: Extraction): string {
  if (!result.fields.length) return "";
  return result.fields
    .map((field) => `${field.label}: ${showValue(field.key, field.value)}`)
    .join(". ")
    .slice(0, 400);
}

export function toStored(result: Extraction): DocumentReading {
  return {
    kept: result.kept.slice(0, 12).map((line) => line.slice(0, 160)),
    fields: result.fields.slice(0, 8).map((field) => ({
      label: field.label.slice(0, 40),
      value: field.value.slice(0, 80),
      derived: field.derived,
    })),
    passes: result.passes,
    dropped: result.dropped,
    confidence: result.confidence,
    resource: result.resource,
    decision: result.decision,
    reasons: result.reasons.slice(0, 4),
  };
}

export function acceptReading(raw: unknown, now = new Date()): DocumentReading | null {
  const parsed = typeof raw === "string" ? parseJson(raw) : raw;
  if (!parsed || typeof parsed !== "object") return null;
  const kept = Array.isArray((parsed as { kept?: unknown }).kept)
    ? (parsed as { kept: unknown[] }).kept.filter((line): line is string => typeof line === "string").map((line) => line.slice(0, 160)).slice(0, 12)
    : [];
  if (!kept.length) return null;
  const settled = settleReadings([{ text: kept.join("\n"), label: "Saved lines" }], "text", now);
  if (!settled.kept.length && !settled.fields.length) return null;
  return toStored(settled);
}

const PLATE = /^[A-Z]{2} \d{1,4}-\d{2}$/;

export function decideReading(
  result: Pick<Extraction, "fields" | "suggestedKind" | "disagreements" | "confidence" | "kept">,
  now: Date,
): { decision: "accepted" | "refused"; reasons: string[] } {
  if (result.confidence === "none" || (!result.fields.length && result.kept.length === 0)) {
    return { decision: "refused", reasons: ["Nothing on this file could be accepted."] };
  }
  const reasons: string[] = [];
  const kind = result.suggestedKind;
  const value = (key: string) => result.fields.find((field) => field.key === key)?.value ?? "";
  const expiry = value("expires");
  const issued = value("issued");
  const plate = value("plate");
  const policy = value("policy");
  const holder = value("holder");
  const disagreed = (word: RegExp) => result.disagreements.some((line) => word.test(line));

  if (!kind) reasons.push("The document type is not on the file.");
  if (kind === "insurance" || kind === "roadworthiness" || kind === "licence") {
    if (!isCalendarDate(expiry) && !disagreed(/expiry/i)) reasons.push("The expiry date is not on the document.");
  }
  if (kind === "roadworthiness" || kind === "registration" || kind === "ownership" || kind === "sale_agreement") {
    if (!plate && !disagreed(/plate/i)) reasons.push("The plate is not on the document.");
  }
  if (kind === "insurance" || kind === "licence" || kind === "ownership" || kind === "sale_agreement") {
    if (!holderName(holder) && !disagreed(/name/i)) reasons.push("The name is not on the document.");
  }
  if (kind === "insurance" && !policy && !plate && !disagreed(/policy|plate/i)) {
    reasons.push("A plate or a policy number is not on the document.");
  }
  if (plate && !PLATE.test(plate)) reasons.push("The plate on the document is not a Ghana plate.");
  if (holder && !holderName(holder)) reasons.push("The name on the document is not a name.");
  if (isCalendarDate(issued) && isCalendarDate(expiry) && issued > expiry) reasons.push("The issue date is after the expiry date.");
  if (isCalendarDate(expiry) && expiry < accraToday(now)) reasons.push("The expiry date has passed.");
  if (disagreed(/expiry/i)) reasons.push("The expiry date on the file was not consistent.");
  if (disagreed(/plate/i)) reasons.push("The plate on the file was not consistent.");
  if (disagreed(/policy/i)) reasons.push("The policy number on the file was not consistent.");
  if (disagreed(/name/i)) reasons.push("The name on the file was not consistent.");
  if (result.disagreements.some((line) => !/expiry|plate|policy|name/i.test(line))) reasons.push("A detail on the file was not consistent.");

  const unique = [...new Set(reasons)].slice(0, 4);
  return { decision: unique.length ? "refused" : "accepted", reasons: unique };
}

export function kindOnReading(reading: DocumentReading): DocumentKind | null {
  return kindFromLabel(reading.fields.find((field) => field.label === "Document")?.value ?? "");
}

export function sealReading(reading: DocumentReading, form: { expiresOn: string | null }): DocumentReading {
  if (reading.decision !== "accepted") return reading;
  const reasons = [...reading.reasons];
  const fileExpiry = reading.fields.find((field) => field.label === "Expiry")?.value ?? "";
  if (isCalendarDate(fileExpiry) && form.expiresOn && form.expiresOn !== fileExpiry) {
    reasons.push("The date entered does not match the date on the document.");
  }
  if (!isCalendarDate(fileExpiry) && form.expiresOn) {
    reasons.push("The date entered is not on the document.");
  }
  if (!reasons.length) return reading;
  return { ...reading, decision: "refused", reasons: [...new Set(reasons)].slice(0, 4) };
}

function holderName(value: string): boolean {
  return /^[A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,3}$/.test(value) && value.length >= 2 && !/\d/.test(value);
}

export function settleReadings(readings: { text: string; label: string }[], resource: ResourceKind, now = new Date()): Extraction {
  const passes = readings.slice(0, 5).map((reading) => ({ ...readPass(reading.text), label: reading.label || "Reading" }));
  const grouped = new Map<string, { key: string; value: string; count: number; evidence: string; derived: boolean; labelled: boolean }>();
  for (const pass of passes) {
    const seen = new Set<string>();
    for (const candidate of pass.candidates) {
      const id = `${candidate.key}:${candidate.value}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const current = grouped.get(id);
      if (!current) {
        grouped.set(id, {
          key: candidate.key,
          value: candidate.value,
          count: 1,
          evidence: candidate.evidence,
          derived: candidate.derived,
          labelled: candidate.labelled,
        });
      } else {
        current.count += 1;
        current.derived = current.derived && candidate.derived;
        current.labelled = current.labelled || candidate.labelled;
        if (candidate.labelled && !current.labelled) current.evidence = candidate.evidence;
        else if (candidate.evidence.length < current.evidence.length && candidate.labelled === current.labelled) current.evidence = candidate.evidence;
      }
    }
  }

  const disagreements: string[] = [];
  const fields: PulledField[] = [];
  for (const key of ["kind", "holder", "plate", "policy", "reference", "insurer", "chassis", "issued", "expires"]) {
    const options = [...grouped.values()].filter((item) => item.key === key).sort((a, b) => b.count - a.count);
    if (!options.length) continue;
      if (options.length > 1 && options[0].count === options[1].count) {
      const label = FIELD_LABEL[key] ?? key;
      disagreements.push(`${label} was read as ${options.slice(0, 2).map((item) => showValue(key, item.value)).join(" and ")}, so it was left blank.`);
      continue;
    }
    const winner = options[0];
    fields.push({
      key,
      label: FIELD_LABEL[key] ?? key,
      value: winner.value,
      evidence: winner.evidence,
      derived: winner.derived,
    });
  }

  const expiry = fields.find((field) => field.key === "expires") ?? null;
  const kindField = fields.find((field) => field.key === "kind") ?? null;
  const hasId = fields.some((field) => ["plate", "policy", "reference", "chassis", "holder"].includes(field.key));
  const labelled = Boolean(expiry && /expir|valid\s+(?:to|until|till|for)/i.test(expiry.evidence));
  const agreed = Boolean(expiry && (grouped.get(`expires:${expiry.value}`)?.count ?? 0) >= 2);
  const kept = chooseKept(passes, fields);
  const confidence = kindField && expiry && hasId && (labelled || agreed) && !disagreements.some((line) => line.startsWith("Expiry"))
    ? "high"
    : fields.length || kept.length
      ? "partial"
      : "none";
  const missing = [
    kindField ? "" : "Document type",
    expiry ? "" : "Expiry",
    hasId ? "" : "A plate, policy number or name",
  ].filter(Boolean);
  const fullest = [...passes].sort((a, b) => b.kept.length - a.kept.length)[0];
  const dropped = fullest?.dropped ?? 0;
  const suggestedKind = kindFromLabel(kindField?.value ?? "");
  const verdict = decideReading({ fields, suggestedKind, disagreements, confidence, kept }, now);
  const note = verdict.decision === "accepted" ? "Accepted." : "Not accepted.";

  return {
    resource,
    kept,
    dropped,
    fields,
    suggestedKind,
    suggestedExpiry: expiry?.value ?? null,
    confidence,
    passes: passes.length,
    missing,
    disagreements,
    passLog: passes.map((pass) => ({
      label: pass.label,
      kept: pass.kept.length,
      dropped: pass.dropped,
      fields: [...new Set(pass.candidates.map((candidate) => candidate.label))],
    })),
    decision: verdict.decision,
    reasons: verdict.reasons,
    note,
  };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function kindFromLabel(value: string): DocumentKind | null {
  const names: [DocumentKind, string][] = [
    ["sale_agreement", "Sale agreement"],
    ["roadworthiness", "Roadworthiness"],
    ["insurance", "Insurance"],
    ["registration", "Registration"],
    ["ownership", "Ownership"],
    ["licence", "Licence"],
  ];
  return names.find(([, label]) => label === value)?.[0] ?? null;
}

function chooseKept(passes: { kept: string[] }[], fields: PulledField[]): string[] {
  const pool = passes.flatMap((pass) => pass.kept);
  const chosen = passes.length === 1
    ? pool
    : pool.filter((line) => fields.some((field) => line.toLowerCase().includes(field.value.toLowerCase()) || field.evidence === line));
  const unique: string[] = [];
  for (const line of chosen) {
    if (!unique.some((item) => item.toLowerCase() === line.toLowerCase())) unique.push(line);
  }
  return unique
    .sort((a, b) => rankLine(b, fields) - rankLine(a, fields))
    .slice(0, 12);
}

function rankLine(line: string, fields: PulledField[]): number {
  return fields.reduce((score, field) => score + (line.toLowerCase().includes(field.value.toLowerCase()) ? 2 : 0), 0) + (line.length < 90 ? 1 : 0);
}

function readPass(text: string): { kept: string[]; dropped: number; candidates: Candidate[] } {
  const lines = text.split(/\r?\n/).map((line) => repairOcrLine(line.trim())).filter(Boolean);
  const kept: string[] = [];
  let dropped = 0;
  for (const line of lines) {
    const bits = line.length > 180 ? windows(line) : keepLine(line) ? [line] : [];
    if (!bits.length) {
      dropped += 1;
      continue;
    }
    kept.push(...bits);
    if (line.length - bits.join(" ").length > 80) dropped += 1;
  }
  const candidates = kept.flatMap(candidatesFromLine);
  const kind = kindOf(kept.join("\n"));
  if (kind) {
    candidates.push({
      key: "kind",
      label: "Document",
      value: kindLabel(kind),
      evidence: kept.find((line) => KIND_RULES.some((rule) => rule.kind === kind && rule.re.test(line))) ?? kept[0] ?? kindLabel(kind),
      derived: false,
      labelled: true,
    });
  }
  return { kept, dropped, candidates };
}

function windows(line: string): string[] {
  const found: string[] = [];
  const patterns = [
    new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH})\\s*,?\\s*\\d{4}\\b`, "ig"),
    new RegExp(`\\b(?:${MONTH})\\s+\\d{1,2}(?:st|nd|rd|th)?\\s*,?\\s*\\d{4}\\b`, "ig"),
    /\b\d{4}[./-]\d{1,2}[./-]\d{1,2}\b/g,
    /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g,
    /\b[A-Z]{2}\s*-?\s*\d{1,4}-\d{2}\b/g,
    /(?:policy|certificate|reference|chassis|vin)\s*(?:no\.?|number|#)?\s*[:.-]?\s*[A-Z0-9][A-Z0-9/-]{3,}/gi,
  ];
  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) {
      const at = match.index ?? 0;
      const bit = line.slice(Math.max(0, at - 30), Math.min(line.length, at + match[0].length + 40)).trim();
      if (keepLine(bit)) found.push(bit);
    }
  }
  return [...new Set(found)];
}

function keepLine(line: string): boolean {
  if (findDates(line).length || findPlate(line) || findPolicy(line) || findChassis(line) || findHolder(line)) return true;
  return line.length <= 90 && /insurance|policy|road\s*worthiness|registration|licen[cs]e|certificate|expir|vehicle|chassis|owner|insured|premium|sticker|comprehensive/i.test(line);
}

function candidatesFromLine(line: string): Candidate[] {
  const out: Candidate[] = [];
  const role = classify(line);
  const dates = findDates(line);
  if (role === "span") {
    const span = line.match(/valid\s+for\s+(\d+|one|two|twelve)\s+(month|year)s?/i);
    const start = dates[dates.length - 1];
    if (span && start) {
      const count = span[1] === "one" ? 1 : span[1] === "two" ? 2 : span[1] === "twelve" ? 12 : Number(span[1]);
      const months = /year/i.test(span[2]) ? count * 12 : count;
      const expiry = addMonths(start.iso, months);
      if (expiry) out.push(field("expires", expiry, line, true, true));
      out.push(field("issued", start.iso, line, false, true));
    }
  } else if (role === "range" && dates.length >= 2) {
    out.push(field("issued", dates[0].iso, line, false, true));
    out.push(field("expires", dates[dates.length - 1].iso, line, false, true));
  } else if (role === "expiry" && dates.length) {
    if (dates.length >= 2) out.push(field("issued", dates[0].iso, line, false, true));
    out.push(field("expires", dates[dates.length - 1].iso, line, false, true));
  } else if (role === "issued" && dates.length) {
    out.push(field("issued", dates[0].iso, line, false, true));
  }
  const plate = findPlate(line);
  if (plate) out.push(field("plate", plate, line, false, /plate|vehicle\s*no/i.test(line)));
  const policy = findPolicy(line);
  if (policy) out.push(field("policy", policy, line, false, true));
  const chassis = findChassis(line);
  if (chassis) out.push(field("chassis", chassis, line, false, true));
  const holder = findHolder(line);
  if (holder) out.push(field("holder", holder, line, false, true));
  const insurer = findInsurer(line);
  if (insurer) out.push(field("insurer", insurer, line, false, true));
  const reference = findReference(line);
  if (reference && reference !== policy) out.push(field("reference", reference, line, false, true));
  return out;
}

function showValue(key: string, value: string): string {
  return key === "expires" || key === "issued" ? formatDay(value) : value;
}

function field(key: string, value: string, evidence: string, derived: boolean, labelled: boolean): Candidate {
  return { key, label: FIELD_LABEL[key] ?? key, value, evidence, derived, labelled };
}

function classify(line: string): "span" | "range" | "expiry" | "issued" | "plain" {
  if (/valid\s+for\s+(?:\d+|one|two|twelve)\s+(?:month|year)/i.test(line)) return "span";
  if (/\bfrom\b/i.test(line) && /\bto\b/i.test(line)) return "range";
  if (/expir|valid\s+(?:to|until|till)|renewal date|due date/i.test(line)) return "expiry";
  if (/date of issue|\bissued\b|valid from|commenc/i.test(line)) return "issued";
  return "plain";
}

function kindOf(text: string): DocumentKind | null {
  const scores = new Map<DocumentKind, number>();
  for (const rule of KIND_RULES) {
    if (rule.re.test(text)) scores.set(rule.kind, (scores.get(rule.kind) ?? 0) + rule.weight);
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  return ranked[0][0];
}

function findPlate(line: string): string | null {
  const match = line.toUpperCase().match(/\b([A-Z]{2})\s*-?\s*(\d{1,4})-(\d{2})\b/);
  if (!match) return null;
  return `${match[1]} ${match[2]}-${match[3]}`;
}

function findPolicy(line: string): string | null {
  const match = line.match(/(?:policy|certificate|cover)\s*(?:no\.?|number|#)?\s*[:.-]?\s*([A-Z0-9][A-Z0-9/-]{3,20})/i);
  if (!match || findDates(match[1]).length) return null;
  return match[1].toUpperCase();
}

function findChassis(line: string): string | null {
  const match = line.match(/(?:chassis|vin)\s*(?:no\.?|number|#)?\s*[:.-]?\s*([A-HJ-NPR-Z0-9]{6,17})/i);
  return match ? match[1].toUpperCase() : null;
}

function findReference(line: string): string | null {
  const match = line.match(/(?:reference|ref)\s*(?:no\.?|number|#)?\s*[:.-]?\s*([A-Z0-9][A-Z0-9/-]{3,20})/i);
  return match ? match[1].toUpperCase() : null;
}

function findHolder(line: string): string | null {
  const match = line.match(/(?:name of (?:the )?(?:insured|owner|holder)|insured(?:'s)? name|owner(?:'s)? name|holder)\s*[:.-]?\s*([A-Za-z][A-Za-z'’-]+(?:\s+[A-Za-z][A-Za-z'’-]+){0,3})/i);
  if (!match) return null;
  const name = match[1].split(/\b(?:expir\w*|policy|vehicle|plate|valid|certificate)\b/i)[0].replace(/\b(insurance|policy|vehicle|certificate)\b/i, "").trim();
  if (name.length < 2 || /insurance|policy|vehicle|certificate/i.test(name)) return null;
  return name;
}

function findInsurer(line: string): string | null {
  const match = line.match(/(?:insurer|underwriter|issued by)\s*[:.-]?\s*([A-Za-z][A-Za-z&'’.-]*(?:\s+[A-Za-z][A-Za-z&'’.-]*){0,4})/i);
  if (!match) return null;
  const name = match[1].trim();
  if (name.length < 2) return null;
  return name;
}

function findDates(line: string): { iso: string }[] {
  const found: { iso: string; at: number }[] = [];
  const take = (iso: string, at: number) => {
    if (!isCalendarDate(iso) || found.some((item) => Math.abs(item.at - at) < 2)) return;
    found.push({ iso, at });
  };
  for (const match of line.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH})\\s*,?\\s*(\\d{4})\\b`, "ig"))) {
    take(isoDate(Number(match[3]), MONTHS[match[2].toLowerCase()] ?? 0, Number(match[1])), match.index ?? 0);
  }
  for (const match of line.matchAll(new RegExp(`\\b(${MONTH})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})\\b`, "ig"))) {
    take(isoDate(Number(match[3]), MONTHS[match[1].toLowerCase()] ?? 0, Number(match[2])), match.index ?? 0);
  }
  for (const match of line.matchAll(/\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b/g)) {
    take(isoDate(Number(match[1]), Number(match[2]), Number(match[3])), match.index ?? 0);
  }
  for (const match of line.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/g)) {
    const year = expandYear(Number(match[3]));
    const first = Number(match[1]);
    const second = Number(match[2]);
    const dayFirst = isoDate(year, second, first);
    const monthFirst = isoDate(year, first, second);
    if (isCalendarDate(dayFirst)) take(dayFirst, match.index ?? 0);
    else if (isCalendarDate(monthFirst)) take(monthFirst, match.index ?? 0);
  }
  return found.map((item) => ({ iso: item.iso }));
}

function expandYear(year: number): number {
  if (year >= 100) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function addMonths(iso: string, months: number): string | null {
  if (!isCalendarDate(iso) || !Number.isFinite(months)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  const next = isoDate(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, Math.min(day, last));
  return isCalendarDate(next) ? next : null;
}

export function repairOcrLine(line: string): string {
  return line.replace(/\s+/g, " ").trim().split(" ").map(repairToken).join(" ");
}

function repairToken(token: string): string {
  const match = token.match(/^([^A-Za-z0-9]*)([A-Za-z0-9][A-Za-z0-9./-]*)([^A-Za-z0-9]*)$/);
  if (!match) return token;
  const [, before, body, after] = match;
  const date = repairDateToken(body);
  if (date) return `${before}${date}${after}`;
  const plate = repairPlateToken(body);
  if (plate) return `${before}${plate}${after}`;
  if (/^[oOlI|0-9./-]+$/.test(body)) {
    const mapped = mapDigits(body);
    if (repairDateToken(mapped) || /^\d{3,5}-\d{2}$/.test(mapped)) return `${before}${mapped}${after}`;
  }
  if ((body.match(/\d/g) ?? []).length >= 3 && /[A-Za-z]/.test(body)) return `${before}${fixId(body)}${after}`;
  const word = repairWord(body);
  return `${before}${word ?? body}${after}`;
}

function repairDateToken(token: string): string | null {
  const mapped = mapDigits(token);
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(mapped) || /^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(mapped)) return mapped;
  return null;
}

function repairPlateToken(token: string): string | null {
  const match = token.match(/^([A-Za-z]{2})[\s-]*([0-9oOlI|]{1,4})-([0-9oOlI|]{2})$/);
  if (!match) return null;
  return `${match[1].toUpperCase()} ${mapDigits(match[2])}-${mapDigits(match[3])}`;
}

function mapDigits(value: string): string {
  return value.replace(/[oO]/g, "0").replace(/[lI|]/g, "1");
}

function fixId(token: string): string {
  return token.replace(/[oOlI|](?=\d)|(?<=\d)[oOlI|]/g, (char) => (char === "l" || char === "I" || char === "|" ? "1" : "0"));
}

function repairWord(token: string): string | null {
  const folded = token.replace(/1/g, "i").replace(/0/g, "o").toLowerCase();
  if (WORDS.includes(folded)) return spellLike(token, folded);
  if (folded.length < 6) return null;
  const close = WORDS.filter((word) => (word[0] === folded[0] || lookalike(word[0], folded[0])) && distance(folded, word) === 1);
  return close.length === 1 ? spellLike(token, close[0]) : null;
}

function spellLike(original: string, word: string): string {
  if (original === original.toUpperCase()) return word.toUpperCase();
  if (original[0] === original[0]?.toUpperCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}

function lookalike(a: string, b: string): boolean {
  return (a === "i" && b === "l") || (a === "l" && b === "i") || (a === "o" && b === "0") || (a === "0" && b === "o");
}

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      next[j] = value;
      if (value < best) best = value;
    }
    if (best > 1) return 2;
    previous = next;
  }
  return previous[b.length] > 1 ? 2 : previous[b.length];
}
