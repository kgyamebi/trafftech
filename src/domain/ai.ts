import { clarify, documentAnswer, lawAnswer, present, socialAnswer } from "./conversation";
import { DriverIntelligenceEngine } from "./intelligence";
import { isEvasionRequest } from "./inbox";
import { explainScoreChange } from "./insights";
import { readTurn } from "./hearing";
import { formatDay, ghs } from "./dates";
import type { AIAnswer, AISection, DocumentView, ViolationView, Workspace } from "./types";

export interface AIContext {
  purpose: string;
  dataClass: Workspace["dataClass"];
  driverFirstName: string;
  plan: string;
  score: Record<string, unknown>;
  vehicle: Record<string, unknown> | null;
  documents: { label: string; status: string; expiresOn: string | null; daysRemaining: number | null; note: string; source: string; read: string }[];
  violations: {
    id: string;
    title: string;
    occurredAt: string;
    location: string;
    amount: string;
    status: string;
    source: string;
    recordedSpeed: number | null;
    limit: number | null;
  }[];
  insights: string[];
  openCount: number;
}

const SENSITIVE_KEYS = ["email", "password", "hash", "salt", "buyerPhone", "storedName", "rawMessage"];

export function buildAIContext(ws: Workspace, purpose: string): AIContext {
  return {
    purpose,
    dataClass: ws.dataClass,
    driverFirstName: ws.viewer.firstName,
    plan: ws.viewer.plan,
    score:
      ws.score.status === "ready"
        ? { overall: ws.score.overall, band: ws.score.band, components: ws.score.components, window: ws.score.window }
        : { status: "insufficient", samples: ws.score.samples, minutes: ws.score.minutes, note: ws.score.note },
    vehicle: ws.activeVehicle
      ? {
          plate: ws.activeVehicle.plate,
          name: ws.activeVehicle.name,
          compliance: ws.activeVehicle.compliance,
          standing: ws.activeVehicle.standingLabel,
        }
      : null,
    documents: ws.documents.map((d) => ({
      label: d.label,
      status: d.status,
      expiresOn: d.expiresOn,
      daysRemaining: d.daysRemaining,
      note: d.note,
      source: d.source,
      read: (d.reading?.fields ?? []).map((field) => `${field.label} ${field.value}`).join(". "),
    })),
    violations: ws.violations.map((v) => ({
      id: v.id,
      title: v.title,
      occurredAt: v.occurredAt,
      location: v.locationLabel,
      amount: ghs(v.amountGhs),
      status: v.status,
      source: v.source,
      recordedSpeed: v.recordedSpeedKph,
      limit: v.applicableLimitKph,
    })),
    insights: ws.insights.map((i) => i.text),
    openCount: ws.totals.activeViolations,
  };
}

export function contextHasSecrets(ctx: AIContext): boolean {
  const blob = JSON.stringify(ctx).toLowerCase();
  return SENSITIVE_KEYS.some((k) => blob.includes(k.toLowerCase()) && k !== "email");
}

function section(kind: AISection["kind"], heading: string, body: string): AISection {
  return { kind, heading, body };
}

function local(title: string, sections: AISection[], refused = false): AIAnswer {
  return {
    title,
    confidenceNote: refused
      ? "Refused. Nokware will not help with evading enforcement."
      : "This summary only restates records already in Nokware. It is not a prediction and not legal advice.",
    sections,
    refused,
    provider: "local",
  };
}

export function refuseEvasion(): AIAnswer {
  return local(
    "That is outside Nokware",
    [
      section(
        "RECOMMENDATION",
        "Stay with the limit",
        "Nokware will not help hide speeding, find cameras, or avoid police. The useful question is whether the limit in front of you is clear, and whether the car is allowed on the road.",
      ),
    ],
    true,
  );
}

export function explainViolation(v: ViolationView | undefined): AIAnswer {
  if (!v) {
    return local("No violation selected", [
      section("FACT", "Nothing to explain", "That notice is not in this account."),
    ]);
  }
  const facts = [
    `${v.title} on ${formatDay(v.occurredAt)}.`,
    v.locationLabel ? `Location saved as ${v.locationLabel}.` : "No location was saved.",
    v.amountGhs != null ? `Amount saved as ${ghs(v.amountGhs)}.` : "No amount was saved.",
    v.recordedSpeedKph != null
      ? `Recorded speed ${v.recordedSpeedKph} km/h against a limit of ${v.applicableLimitKph ?? "unknown"} km/h, as entered.`
      : "No recorded speed was entered.",
    `Status in Nokware: ${v.status.replaceAll("_", " ")}.`,
    "Official connection: unavailable. This is not a live TraffiTech file.",
  ];
  return local("About this notice", [
    section("FACT", "What Nokware has", facts.join(" ")),
    section(
      "USER_PROVIDED",
      "Where it came from",
      v.source === "DEMO"
        ? "This notice is demo data, created to show the product. It is not your record and not an official notice."
        : `Source label: ${v.source.replaceAll("_", " ").toLowerCase()}. The words of the original message are kept only if you pasted them.`,
    ),
    section(
      "AI_INFERENCE",
      "What this might mean",
      v.status === "action_required" || v.status === "overdue"
        ? "A decision is still open in your records: pay through an official channel, or prepare a contest. Nokware cannot say which will succeed."
        : "Nothing in the saved status asks for a new decision today.",
    ),
    section(
      "RECOMMENDATION",
      "A careful next step",
      "Read the evidence you actually have. If you pay or contest, do it on the official TraffiTech portal or the short codes published by the Ghana Police Service. Keep the receipt.",
    ),
  ]);
}

export function summarizeDriving(ws: Workspace): AIAnswer {
  if (ws.score.status !== "ready" || ws.score.overall == null || !ws.score.components) {
    return local("Not enough driving yet", [
      section("FACT", "No score", ws.score.note),
      section(
        "RECOMMENDATION",
        "How a score appears",
        "Record a drive of at least 30 minutes, with the limit selected. Practice routes stay on the screen and are not saved.",
      ),
    ]);
  }
  const c = ws.score.components;
  return local("This period of driving", [
    section(
      "FACT",
      "Calculated score",
      `${ws.score.overall} · ${ws.score.band}. Speed ${c.speed}. Braking ${c.braking}. Acceleration ${c.acceleration}. Traffic ${c.traffic}. Consistency ${c.consistency}. Window: ${ws.score.window}. Samples: ${ws.score.samples}.`,
    ),
    section(
      "AI_INFERENCE",
      "Reading",
      ws.insights[0]?.text ?? "The components above are the whole story available from saved sessions.",
    ),
    section(
      "RECOMMENDATION",
      "What to practise",
      c.speed < c.braking
        ? "Bring speed down to the limit you selected, and keep it there."
        : "Smooth the stops. The score improves when braking events fall, not when speed rises.",
    ),
  ]);
}

export function analyzeContest(v: ViolationView | undefined, notes: string): AIAnswer {
  if (!v) {
    return local("No case", [section("FACT", "Missing notice", "Choose a notice before preparing a contest.")]);
  }
  const missing: string[] = [];
  if (!v.evidence.length) missing.push("evidence saved in Nokware");
  if (!v.ticketNumber) missing.push("a ticket number");
  if (!notes.trim()) missing.push("your own account of what happened");
  if (!v.deadline) missing.push("the deadline printed on the notice");
  const issues: string[] = [];
  if (v.scamAssessment === "suspicious") issues.push("The imported message was flagged as suspicious. Confirm it is real before you act.");
  if (v.status === "paid_user_reported")
    issues.push("You already recorded a payment. Public guidance says a paid notice can no longer be contested. Confirm that on the official portal.");
  if (v.recordedSpeedKph != null && v.applicableLimitKph != null && v.recordedSpeedKph > v.applicableLimitKph)
    issues.push("The speeds you entered put the vehicle over the limit you entered. That may matter. It is not a finding.");

  return local("Contest notes", [
    section(
      "FACT",
      "Case summary",
      `${v.title}, ${formatDay(v.occurredAt)}, ${v.locationLabel || "location not saved"}, ${ghs(v.amountGhs)}. Status: ${v.status.replaceAll("_", " ")}.`,
    ),
    section(
      "USER_PROVIDED",
      "What you wrote",
      notes.trim() || "No note yet.",
    ),
    section(
      "AI_INFERENCE",
      "Potential issues",
      issues.length ? issues.join(" ") : "No contradiction showed up in the fields you saved. That is not the same as a strong case.",
    ),
    section(
      "FACT",
      "Missing information",
      missing.length ? `Still absent: ${missing.join(", ")}.` : "The basic fields are present. An officer may still ask for more.",
    ),
    section(
      "RECOMMENDATION",
      "Next steps",
      "This organises notes. It does not submit a contest. Public Ghana Police guidance says a TraffiTech contest starts online, within the period on the notice, after you have looked at the evidence. Potential issue identified only where the notes above say so. Nokware will not say that you will win.",
    ),
  ]);
}

export function answerVehicleQuestion(ws: Workspace, question: string): AIAnswer {
  const q = question.toLowerCase();
  const docs = ws.documents;
  if (/renew|expir|insurance|roadworth|registration|licence|license/.test(q)) {
    const upcoming = [...docs].filter((d) => d.expiresOn).sort((a, b) => (a.expiresOn ?? "").localeCompare(b.expiresOn ?? ""));
    const lines = upcoming.map((d) => `${d.label}: ${d.status}, ${d.expiresOn ? formatDay(d.expiresOn) : "no date"}`);
    return local("Documents", [
      section("FACT", "Dates in your vault", lines.length ? lines.join(". ") + "." : "No documents saved yet."),
      section(
        "RECOMMENDATION",
        "Renewal",
        "Update the date after the issuer gives you a new one. Nokware does not renew insurance, roadworthiness or registration for you.",
      ),
    ]);
  }
  return local("Vehicle", [
    section(
      "FACT",
      "Active vehicle",
      ws.activeVehicle
        ? `${ws.activeVehicle.plate}, ${ws.activeVehicle.name}. ${ws.activeVehicle.standingLabel}. Compliance ${ws.activeVehicle.compliance ?? "not calculated"}%.`
        : "No vehicle yet.",
    ),
    section("USER_PROVIDED", "Question", question),
    section(
      "AI_INFERENCE",
      "Limit of this answer",
      "The local assistant can read the records listed above. It will not invent a registration status.",
    ),
  ]);
}

function tripAnswer(ws: Workspace): AIAnswer {
  const last = [...ws.sessions].reverse().find((session) => session.samples > 0) ?? null;
  if (!last) {
    return local("This trip", [
      section("FACT", "No saved trip", "There is no recorded drive to explain. A demonstration is not saved."),
    ]);
  }
  const assessed = DriverIntelligenceEngine.fromWorkspace(ws).assessTrip(
    {
      demo: ws.mode === "demo",
      minutes: last.minutes,
      samples: last.samples,
      compliance: last.speedCompliance,
      harshBrakes: last.harshBrakes,
      harshAccels: last.harshAccelerations,
      events: last.notes,
    },
    "Traffic is not available from the connected map provider.",
  );
  return local("This trip", [
    section("FACT", "Calculated", `${last.originLabel ?? last.roadContext} to ${last.destinationLabel ?? "the recorded drive"}. Speed compliance ${assessed.compliance == null ? "was not scored" : `${assessed.compliance}%`}.`),
    section("FACT", "Quality", assessed.quality == null ? assessed.qualityNote : `${assessed.quality}. ${assessed.qualityNote}`),
    section("FACT", "Score", assessed.scoreImpact),
    section("RECOMMENDATION", "Next", assessed.improvements[0] ?? "Nothing in this trip asks for a change."),
  ]);
}

function factsFor(ws: Workspace, intent: string, question: string): AIAnswer {
  if (intent === "score") {
    const text = explainScoreChange(ws.scores.month, ws.scores["6months"].status === "ready" ? ws.scores["6months"] : null);
    return local("Your score", [
      section("FACT", "Calculated", text),
      section("AI_INFERENCE", "How to read it", "A lower number means the recorded driving was less smooth or less within the limits you selected. It is not a punishment from the Police."),
      section("RECOMMENDATION", "Next", "Open Driver Score and compare this month with the longer window."),
    ]);
  }
  if (intent === "violation") return explainViolation(ws.violations[0]);
  if (intent === "ready") {
    const report = DriverIntelligenceEngine.fromWorkspace(ws).readiness();
    return local("Before you drive", [
      section("FACT", report.state, report.title),
      section("FACT", "Source", report.source === "DEMO" ? "DEMO" : "CALCULATED"),
      section(
        "RECOMMENDATION",
        "Next",
        report.actions[0]?.detail ?? report.notices[0]?.title ?? "Nothing in the saved records needs a decision before this trip.",
      ),
    ]);
  }
  if (intent === "trip") return tripAnswer(ws);
  if (intent === "documents") return documentAnswer(ws);
  if (intent === "summary") return summarizeDriving(ws);
  if (intent === "law") return lawAnswer();
  if (intent === "next") {
    const primary = ws.primaryAttention;
    return local("What is next", [
      section("FACT", "Highest item", primary ? `${primary.title}. ${primary.detail}` : ws.hero.title),
      section("RECOMMENDATION", "Do this", primary?.recommendedAction ?? "Add your vehicle, then record a real drive when you are ready."),
    ]);
  }
  return answerVehicleQuestion(ws, question);
}

export function answerQuestion(ws: Workspace, question: string, history: string[] = []): AIAnswer {
  const labels = ws.documents.map((doc) => doc.label);
  const reading = readTurn(question, history, labels);
  if (reading.intent === "evasion" || isEvasionRequest(question)) return refuseEvasion();
  if (reading.intent === "unclear" || reading.confidence === "unclear") return clarify(reading);
  const social = socialAnswer(reading);
  if (social) return present(social, reading, false);
  return present(factsFor(ws, reading.intent, reading.text), reading, true);
}

export function localDriverAnswer(ws: Workspace, question: string, purpose = "ask", history: string[] = []): AIAnswer {
  if (purpose === "violation") return explainViolation(ws.violations.find((v) => question.includes(v.id)) ?? ws.violations[0]);
  if (purpose === "contest") return analyzeContest(ws.violations[0], question);
  if (purpose === "summary") return summarizeDriving(ws);
  return answerQuestion(ws, question, history);
}

export function assertNoOfficialSource(documents: DocumentView[]): boolean {
  return documents.every((d) => d.source !== "OFFICIAL_CONNECTED_SOURCE" && d.verification !== "not_verified" || d.verification === "user_provided" || d.verification === "not_verified");
}
