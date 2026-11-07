import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAIContext, contextHasSecrets, localDriverAnswer } from "./ai";
import { assembleWorkspace } from "./assemble";
import { buildAttention, heroFromAttention } from "./attention";
import { compliancePercent, documentStatus } from "./compliance";
import { commandSearch } from "./command";
import { addDays } from "./dates";
import { buildDemoWorkspace, demoWritesBlocked } from "./demo";
import { activePlanLine, canAddVehicle, entitlementsFor, reminderLeads } from "./entitlements";
import { estimateAutomatedFine, estimateLateAddition, estimateSpeedFine } from "./fines";
import { isEvasionRequest, parseTrafficMessage } from "./inbox";
import { explainScoreChange } from "./insights";
import { allowsInApp, leadBucket } from "./notifications";
import { onboardingComplete } from "./onboarding";
import { MIN_MINUTES, MIN_SAMPLES, computeDriverScore } from "./score";
import { defaultPrefs, type DocumentRecord, type DrivingSessionRecord, type UserRecord, type ViolationRecord } from "./types";
import { addVehicle, authenticate, createFleet, importViolation, recordPayment, requestPlan, signup } from "../server/accounts";

const NOW = new Date("2026-11-06T12:00:00.000Z");

describe("driver score", () => {
  it("refuses a score without enough driving", () => {
    const score = computeDriverScore({ sessions: [], violations: [], now: NOW, window: "month" });
    expect(score.status).toBe("insufficient");
    expect(score.overall).toBeNull();
    expect(score.requiredMinutes).toBe(MIN_MINUTES);
    expect(score.requiredSamples).toBe(MIN_SAMPLES);
    expect(score.note).toMatch(/Not enough driving data yet/);
  });

  it("calculates the demo month as 94 excellent from the sample sessions", () => {
    const ws = buildDemoWorkspace(NOW);
    expect(ws.score.status).toBe("ready");
    expect(ws.score.overall).toBe(94);
    expect(ws.score.band).toBe("Excellent");
    expect(ws.score.components).toMatchObject({
      speed: 97,
      braking: 91,
      acceleration: 89,
      traffic: 100,
      consistency: 93,
    });
    expect(ws.score.source).toBe("DEMO");
  });

  it("does not fold fleet sessions into the driver's score", () => {
    const ws = buildDemoWorkspace(NOW);
    expect(ws.sessions.every((s) => s.driverId == null)).toBe(true);
    expect(ws.fleet?.drivers.length).toBe(6);
  });
});

describe("compliance and attention", () => {
  it("scores the demo Corolla at 96% and keeps the hero ready", () => {
    const ws = buildDemoWorkspace(NOW);
    expect(ws.activeVehicle?.plate).toBe("GH 1234-25");
    expect(ws.activeVehicle?.compliance).toBe(96);
    expect(ws.hero.state).toBe("ready");
    expect(ws.hero.title).toBe("You're ready to drive.");
    expect(ws.primaryAttention?.title).toMatch(/Roadworthiness expires in 27 days/);
    expect(ws.statuses.find((s) => s.id === "roadworthiness")?.value).toBe("Expiring");
    expect(ws.statuses.find((s) => s.id === "roadworthiness")?.tone).toBe("warn");
    expect(ws.statuses.find((s) => s.id === "traffic")?.value).toBe("Clear");
    expect(ws.totals.activeViolations).toBe(0);
    expect(ws.totals.outstandingGhs).toBe(0);
    expect(ws.totals.paidThisYearGhs).toBe(240);
  });

  it("raises an urgent fine ahead of a document reminder", () => {
    const doc = {
      id: "d1",
      userId: "u",
      vehicleId: "v",
      kind: "insurance",
      label: "Insurance",
      expiresOn: "2026-11-20",
      updatedAt: NOW.toISOString(),
      verification: "user_provided",
      fileName: null,
      storedName: null,
      mime: null,
      note: "",
      source: "USER_PROVIDED",
      dataClass: "REAL",
    } satisfies DocumentRecord;
    const violation = {
      id: "v1",
      userId: "u",
      vehicleId: "v",
      kind: "speed",
      title: "Speed violation",
      occurredAt: "2026-10-28T10:42:00.000Z",
      locationLabel: "Accra–Tema Motorway",
      amountGhs: 240,
      status: "action_required",
      deadline: "2026-11-11",
      deadlineConfirmed: true,
      recordedSpeedKph: 78,
      applicableLimitKph: 50,
      source: "IMPORTED",
      rawMessage: null,
      scamAssessment: "insufficient",
      ticketNumber: null,
      dataClass: "REAL",
    } satisfies ViolationRecord;
    const items = buildAttention({ now: NOW, documents: [doc], violations: [violation], transfers: [], score: computeDriverScore({ sessions: [], violations: [], now: NOW, window: "month" }), sessions: [] });
    expect(items[0].type).toBe("FINE_DEADLINE");
    expect(items[0].severity).toBe("urgent");
    const hero = heroFromAttention({ hasVehicle: true, primary: items[0] });
    expect(hero.state).toBe("urgent");
  });

  it("marks a past deadline overdue and estimates the published daily addition", () => {
    const ws = buildDemoWorkspace(NOW);
    const base = ws.violations[0];
    expect(base.status).toBe("paid_user_reported");
    const view = assembleWorkspace({
      now: NOW,
      mode: "user",
      user: demoUser(),
      vehicles: [],
      documents: [],
      violations: [
        {
          id: "late",
          userId: "u",
          vehicleId: null,
          kind: "speed",
          title: "Speed violation",
          occurredAt: "2026-10-01T00:00:00.000Z",
          locationLabel: "Tema",
          amountGhs: 240,
          status: "action_required",
          deadline: "2026-10-20",
          deadlineConfirmed: true,
          recordedSpeedKph: null,
          applicableLimitKph: null,
          source: "USER_PROVIDED",
          rawMessage: null,
          scamAssessment: "insufficient",
          ticketNumber: null,
          dataClass: "REAL",
        },
      ],
      evidence: [],
      payments: [],
      contests: [],
      sessions: [],
      notifications: [],
      reads: [],
      fleet: null,
      fleetDrivers: [],
      transfers: [],
      questions: [],
    });
    expect(view.violations[0].status).toBe("overdue");
    expect(view.violations[0].lateEstimateGhs).toBe(estimateLateAddition(240, view.violations[0].daysRemaining! * -1));
  });

  it("drops compliance when a required document is expired", () => {
    const docs = [
      stubDoc("insurance", "2026-01-01"),
      stubDoc("roadworthiness", "2027-01-01"),
      stubDoc("registration", "2027-01-01"),
    ];
    expect(documentStatus("2026-01-01", NOW).status).toBe("expired");
    expect(compliancePercent(docs, "veh", NOW)).toBe(67);
  });
});

describe("fines, inbox and entitlements", () => {
  it("uses the published speeding bands and refuses to invent a sixth general fine", () => {
    expect(estimateSpeedFine(12).amountGhs).toBe(240);
    expect(estimateSpeedFine(21).amountGhs).toBe(300);
    expect(estimateSpeedFine(50).amountGhs).toBe(420);
    expect(estimateSpeedFine(51).amountGhs).toBe(480);
    expect(estimateSpeedFine(3).amountGhs).toBeNull();
    expect(estimateAutomatedFine(1).amountGhs).toBe(120);
    expect(estimateAutomatedFine(6).amountGhs).toBeNull();
    expect(estimateLateAddition(240, 3)).toBe(7.2);
  });

  it("flags suspicious notices and never calls a pattern legitimate", () => {
    const scam = parseTrafficMessage("From: 0244000000 Pay GH₵240 to Kwame Momos. https://bit.ly/fine");
    expect(scam.assessment).toBe("suspicious");
    expect(scam.sourceNote).toMatch(/suspicious/i);
    const closer = parseTrafficMessage("GPS-MTTD TraffiTech ticket 001.000240112 GH₵240 on 28 October 2026 at Accra-Tema Motorway. Speed 112 km/h limit 100.");
    expect(closer.assessment).toBe("resembles_public_pattern");
    expect(closer.sourceNote.toLowerCase()).not.toMatch(/definitely legitimate|this is official/);
    expect(closer.amountGhs).toBe(240);
    expect(closer.occurredOn).toBe("2026-10-28");
  });

  it("keeps urgent alerts on and gates vehicles by plan", () => {
    expect(allowsInApp("urgent", { ...defaultPrefs(), important: false, information: false })).toBe(true);
    expect(canAddVehicle("free", 1).ok).toBe(false);
    expect(canAddVehicle("pro", 1).ok).toBe(true);
    expect(entitlementsFor("free").ai).toBe(false);
    expect(activePlanLine(entitlementsFor("free"))).toMatch(/1 vehicle/);
    expect(activePlanLine(entitlementsFor("free"))).toMatch(/does not charge/);
    expect(activePlanLine(entitlementsFor("pro"))).toMatch(/Driver Intelligence/);
    expect(entitlementsFor("pro").historicalAnalytics).toBe(true);
    expect(reminderLeads("free")).toEqual([30, 7, 0]);
    expect(leadBucket(27, reminderLeads("free"))).toBe(30);
  });
});

describe("ai, onboarding, demo isolation", () => {
  it("builds context without secrets and refuses evasion", () => {
    const ws = buildDemoWorkspace(NOW);
    const ctx = buildAIContext(ws, "ask");
    expect(JSON.stringify(ctx)).not.toContain("ama@demo.nokware");
    expect(contextHasSecrets(ctx)).toBe(false);
    expect(ws.documents.every((d) => d.source !== "OFFICIAL_CONNECTED_SOURCE")).toBe(true);
    expect(ws.connectivity.officialPayments).toBe(false);
    expect(ws.connectivity.officialViolations).toBe(false);
    const refused = localDriverAnswer(ws, "How do I avoid the TraffiTech cameras on the motorway?");
    expect(refused.refused).toBe(true);
    expect(isEvasionRequest("where are the police ahead")).toBe(true);
    const explained = localDriverAnswer(ws, "Why did my score change?");
    expect(explained.sections.some((s) => s.kind === "FACT")).toBe(true);
    expect(explained.sections.map((s) => s.body).join(" ")).not.toMatch(/you will win/i);
  });

  it("lets a skipped tour finish and keeps demo writes out of user mode", () => {
    expect(onboardingComplete({ skipped: true, stepIndex: 0 })).toBe(true);
    expect(onboardingComplete({ skipped: false, stepIndex: 3 })).toBe(false);
    expect(onboardingComplete({ skipped: false, stepIndex: 7 })).toBe(false);
    expect(onboardingComplete({ skipped: false, stepIndex: 8 })).toBe(true);
    expect(demoWritesBlocked("demo")).toBe(true);
    expect(demoWritesBlocked("user")).toBe(false);
    const ws = buildDemoWorkspace(NOW);
    expect(ws.mode).toBe("demo");
    expect(ws.dataClass).toBe("DEMO");
    expect(ws.violations[0].evidence[0].note).toMatch(/not a photograph/i);
  });

  it("explains a real movement between windows", () => {
    const ws = buildDemoWorkspace(NOW);
    const text = explainScoreChange(ws.scores.month, ws.scores["6months"]);
    expect(text).toMatch(/94|score/i);
    expect(ws.insights.length).toBeGreaterThan(0);
    expect(ws.achievements.find((a) => a.id === "steady")?.earned).toBe(true);
    expect(ws.achievements.find((a) => a.id === "clear")?.earned).toBe(false);
    expect(ws.achievements.find((a) => a.id === "ready")?.earned).toBe(false);
  });

  it("searches commands without leaving the product", () => {
    const hits = commandSearch(buildDemoWorkspace(NOW), "insurance");
    expect(hits[0].href.startsWith("/")).toBe(true);
    expect(hits.some((h) => h.id === "insurance-expiry")).toBe(true);
  });
});

describe("critical journeys", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  function tmp() {
    const d = mkdtempSync(path.join(os.tmpdir(), "nokware-"));
    dirs.push(d);
    return d;
  }

  it("signs up, adds one vehicle, blocks a second, imports a notice and records a payment", async () => {
    const dir = tmp();
    const user = await signup(dir, { name: "Kwesi Mensah", email: "kwesi@example.com", password: "correct-horse" });
    expect(user.onboardingCompleted).toBe(false);
    expect(user.plan).toBe("free");
    await expect(authenticate(dir, "kwesi@example.com", "wrong-password")).rejects.toThrow(/does not match/);
    const vehicle = await addVehicle(dir, user.id, {
      plate: "gw 4821-24",
      make: "Toyota",
      model: "Corolla",
      year: "2018",
      colour: "White",
    });
    expect(vehicle.plate).toBe("GW 4821-24");
    await expect(
      addVehicle(dir, user.id, { plate: "GR 1000-22", make: "Honda", model: "Fit", year: "2016", colour: "Red" }),
    ).rejects.toThrow(/one vehicle/i);

    const imported = await importViolation(dir, user.id, {
      raw: "GPS-MTTD TraffiTech ticket 001.000240112 GH₵240 on 28 October 2026 at Accra-Tema Motorway. Speed 78 km/h limit 50.",
      vehicleId: vehicle.id,
      deadline: "2026-11-11",
      confirmDeadline: true,
    });
    expect(imported.violation.source).toBe("IMPORTED");
    expect(imported.parsed.assessment).toBe("resembles_public_pattern");
    expect(imported.violation.dataClass).toBe("REAL");

    await recordPayment(dir, user.id, {
      violationId: imported.violation.id,
      amount: "240",
      paidOn: "2026-11-06",
      reference: "user receipt 19",
    });

    await requestPlan(dir, user.id, "fleet");
    await expect(createFleet(dir, user.id, "Mensah deliveries")).rejects.toThrow(/not turn billing on|closed/i);
  });

  it("does not let a pending plan unlock fleet", async () => {
    const dir = tmp();
    const user = await signup(dir, { name: "Abena Owusu", email: "abena@example.com", password: "correct-horse" });
    await requestPlan(dir, user.id, "pro");
    const { readDatabase } = await import("../server/store");
    const saved = readDatabase(dir).users[0];
    expect(saved.plan).toBe("pro");
    expect(saved.planStatus).toBe("pending_checkout");
  });
});

function demoUser(): UserRecord {
  return {
    id: "u",
    email: "a@b.c",
    name: "Ama Mensah",
    role: "driver",
    plan: "free",
    planStatus: "active",
    onboardingCompleted: true,
    createdAt: NOW.toISOString(),
    activeVehicleId: null,
    dataClass: "REAL",
    prefs: defaultPrefs(),
  };
}

function stubDoc(kind: DocumentRecord["kind"], expiresOn: string): DocumentRecord {
  return {
    id: kind,
    userId: "u",
    vehicleId: "veh",
    kind,
    label: kind,
    expiresOn,
    updatedAt: NOW.toISOString(),
    verification: "user_provided",
    fileName: null,
    storedName: null,
    mime: null,
    note: "",
    source: "USER_PROVIDED",
    dataClass: "REAL",
  };
}

void addDays;
