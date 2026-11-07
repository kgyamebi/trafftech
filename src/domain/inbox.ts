import type { ScamAssessment, ViolationKind } from "./types";

export interface ParsedNotice {
  title: string;
  kind: ViolationKind;
  amountGhs: number | null;
  occurredOn: string | null;
  locationLabel: string;
  ticketNumber: string | null;
  recordedSpeedKph: number | null;
  applicableLimitKph: number | null;
  senderHint: string | null;
  assessment: ScamAssessment;
  reasons: string[];
  sourceNote: string;
}

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function parseHumanDate(text: string): string | null {
  const named = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})\b/i,
  );
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    return `${named[3]}-${month}-${named[1].padStart(2, "0")}`;
  }
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

export function parseTrafficMessage(raw: string): ParsedNotice {
  const text = raw.replace(/\0/g, "").trim();
  const reasons: string[] = [];
  const lower = text.toLowerCase();

  const amountMatch = text.match(/(?:GHS|GH₵|GH¢|GHC)\s*([0-9]{2,5}(?:\.[0-9]{1,2})?)/i);
  const amountGhs = amountMatch ? Number(amountMatch[1]) : null;
  const occurredOn = parseHumanDate(text);
  const ticket = text.match(/\b(\d{3}\.\d{6,})\b/);
  const speed = text.match(/(?:recorded(?:\s+speed)?|speed(?:\s+of)?)\s*[:\-]?\s*(\d{2,3})\s*km/i);
  const limit = text.match(/(?:limit|limited to)\s*[:\-]?\s*(\d{2,3})/i);
  const sender = text.match(/(?:from|sender)\s*[:\-]\s*([^\n]{3,40})/i);
  const location =
    text.match(/(?:at|on|along|location)\s*[:\-]?\s*([A-Za-z][A-Za-z0-9 .,'’\-]{4,70})/i)?.[1]?.split(/[.\n]/)[0]?.trim() ??
    "";

  let kind: ViolationKind = "other";
  let title = "Traffic notice";
  if (/speed|km\/?h/.test(lower)) {
    kind = "speed";
    title = "Speed violation";
  } else if (/seat\s?belt/.test(lower)) {
    kind = "seatbelt";
    title = "Seatbelt notice";
  } else if (/roadworth/.test(lower)) {
    kind = "roadworthiness";
    title = "Roadworthiness notice";
  } else if (/insur/.test(lower)) {
    kind = "insurance";
    title = "Insurance notice";
  }

  const hasLink = /https?:\/\/|www\.|\bbit\.ly\b|\btinyurl\b/i.test(text);
  const personalPay =
    /send\s+(?:the\s+)?(?:money|cash|fine)|momo|mobile money name|personal (?:account|wallet|number)|pay\s+to\s+[A-Z][a-z]+/.test(
      text,
    );
  const senderLine = sender?.[1]?.trim() ?? "";
  const senderIsHandset = /(?:^|\s)0\d{9}\b/.test(senderLine);
  const oddShortCode = /\*\d{2,4}(?:\*\d+)?#/.test(text) && !/\*710\*0#|\*220#|\*920\*57#/.test(text);
  const mentionsOfficial = /gps[-\s]?mttd|traffitech/i.test(text);

  if (hasLink) reasons.push("The text includes a web link. Public Ghana Police guidance says official TraffiTech texts do not include clickable links.");
  if (personalPay) reasons.push("The text asks for payment to a person or a personal wallet. Official guidance points to the published portal and *710*0#.");
  if (senderIsHandset) reasons.push("The sender looks like a regular mobile number. Public guidance says official texts do not come from 10-digit numbers.");
  if (oddShortCode) reasons.push("The text uses a short code other than the published *710*0#, *220# or *920*57#.");

  let assessment: ScamAssessment = "insufficient";
  if (reasons.length > 0) assessment = "suspicious";
  else if (mentionsOfficial && (ticket || amountGhs)) assessment = "resembles_public_pattern";
  else if (text.length < 12) assessment = "insufficient";

  return {
    title,
    kind,
    amountGhs: Number.isFinite(amountGhs) ? amountGhs : null,
    occurredOn,
    locationLabel: location.replace(/\s+/g, " ").slice(0, 80),
    ticketNumber: ticket?.[1] ?? null,
    recordedSpeedKph: speed ? Number(speed[1]) : null,
    applicableLimitKph: limit ? Number(limit[1]) : null,
    senderHint: senderLine || null,
    assessment,
    reasons,
    sourceNote:
      assessment === "resembles_public_pattern"
        ? "This resembles patterns described in public TraffiTech guidance. That is not verification. Confirm only on the official portal or the published short codes."
        : assessment === "suspicious"
          ? "This message does not match the known official pattern. Treat it as suspicious until you confirm it through a published Police channel."
          : "There is not enough here to compare with the published official pattern. Nokware cannot verify it.",
  };
}

const EVASION =
  /(avoid|evade|dodge|beat|hide from|don't get caught|do not get caught).{0,40}(camera|police|traffitech|enforcement|ticket|radar)|(camera|police|speed trap).{0,30}(location|where|map|ahead|avoid)|how (?:do i|to) (?:speed|not get caught)|defeat enforcement/i;

export function isEvasionRequest(question: string): boolean {
  return EVASION.test(question);
}
