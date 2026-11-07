import { buildAttention, heroFromAttention } from "./attention";
import { buildAchievements, buildInsights } from "./insights";
import { compliancePercent, docStatusLabel, documentStatus, standingLabel, statusTone, vehicleStanding, violationAffectsTraffic } from "./compliance";
import { accraToday, addDays, dayLabel, daysUntil, firstNameOf, formatDay, greetingFor, ghs, minutesBetween } from "./dates";
import { entitlementsFor } from "./entitlements";
import { estimateLateAddition } from "./fines";
import { notificationsFromAttention } from "./notifications";
import { allWindows, speedCompliance } from "./score";
import type {
  ContestRecord,
  Database,
  DocumentView,
  DrivingSessionRecord,
  EvidenceRecord,
  FleetDriverRecord,
  FleetRecord,
  FleetView,
  PaymentRecord,
  PaymentView,
  ScoreWindow,
  SessionView,
  StatusPill,
  TimelinePoint,
  PlaceView,
  SavedPlaceRecord,
  TransferRecord,
  UserRecord,
  VehicleView,
  ViolationRecord,
  ViolationView,
  Workspace,
} from "./types";

export interface AssembleInput {
  now: Date;
  mode: "user" | "demo";
  user: UserRecord;
  vehicles: Database["vehicles"];
  documents: Database["documents"];
  violations: Database["violations"];
  evidence: EvidenceRecord[];
  payments: PaymentRecord[];
  contests: ContestRecord[];
  sessions: DrivingSessionRecord[];
  notifications: Database["notifications"];
  reads: Database["reads"];
  fleet: FleetRecord | null;
  fleetDrivers: FleetDriverRecord[];
  fleetSessions?: DrivingSessionRecord[];
  transfers: TransferRecord[];
  questions: Database["questions"];
  places?: SavedPlaceRecord[];
  expenses?: Database["expenses"];
  scoreWindow?: ScoreWindow;
}

function sessionView(s: DrivingSessionRecord): SessionView {
  const speeds = s.samples.map((x) => x.speedKph);
  const mean = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null;
  return {
    id: s.id,
    driverId: s.driverId,
    vehicleId: s.vehicleId,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    minutes: Math.round(minutesBetween(s.startedAt, s.endedAt)),
    roadContext: s.roadContext,
    samples: s.samples.length,
    harshBrakes: s.harshBrakes,
    harshAccelerations: s.harshAccelerations,
    simulated: s.simulated,
    source: s.source,
    meanSpeed: mean,
    speedCompliance: speedCompliance(s.samples),
    originLabel: s.originLabel ?? null,
    destinationLabel: s.destinationLabel ?? null,
    distanceM: s.distanceM ?? null,
    notes: s.notes ?? [],
  };
}

function viewViolation(
  v: ViolationRecord,
  evidence: EvidenceRecord[],
  vehicles: Database["vehicles"],
  now: Date,
): ViolationView {
  const days = v.deadline ? daysUntil(v.deadline, now) : null;
  const overdue = v.status === "action_required" && v.deadlineConfirmed && days != null && days < 0;
  const status = overdue ? "overdue" : v.status;
  const late =
    overdue && v.amountGhs != null && days != null ? estimateLateAddition(v.amountGhs, Math.abs(days)) : null;
  return {
    id: v.id,
    vehicleId: v.vehicleId,
    kind: v.kind,
    title: v.title,
    occurredAt: v.occurredAt,
    locationLabel: v.locationLabel,
    amountGhs: v.amountGhs,
    status,
    storedStatus: v.status,
    deadline: v.deadline,
    deadlineConfirmed: v.deadlineConfirmed,
    daysRemaining: days,
    recordedSpeedKph: v.recordedSpeedKph,
    applicableLimitKph: v.applicableLimitKph,
    source: v.source,
    rawMessage: v.rawMessage,
    scamAssessment: v.scamAssessment,
    ticketNumber: v.ticketNumber,
    plate: vehicles.find((veh) => veh.id === v.vehicleId)?.plate ?? null,
    lateEstimateGhs: late,
    evidence: evidence
      .filter((e) => e.violationId === v.id)
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        url: e.storedName ? `/api/files/${e.id}` : e.kind === "demo_illustration" ? null : null,
        note: e.note,
        capturedAt: e.capturedAt,
        source: e.source,
        mime: e.mime,
      })),
  };
}

function fleetStanding(score: number | null, open: number, compliance: number | null): VehicleView["standing"] {
  if (open > 0 || (compliance != null && compliance < 50)) return "high_risk";
  if ((score != null && score < 70) || (compliance != null && compliance < 90)) return "attention";
  if (score == null && compliance == null) return "unknown";
  return "good";
}

export function assembleWorkspace(input: AssembleInput): Workspace {
  const now = input.now;
  const user = input.user;
  const scoreSource = input.mode === "demo" ? "DEMO" : "CALCULATED";
  const personalSessions = input.sessions.filter((s) => (s.driverId ?? null) === null);
  const scores = allWindows({
    sessions: personalSessions,
    violations: input.violations,
    now,
    source: scoreSource,
    driverId: null,
  });
  const window = input.scoreWindow ?? "month";
  const score = scores[window];

  const documents: DocumentView[] = input.documents.map((d) => {
    const derived = documentStatus(d.expiresOn, now);
    return {
      id: d.id,
      vehicleId: d.vehicleId,
      kind: d.kind,
      label: d.label,
      expiresOn: d.expiresOn,
      updatedAt: d.updatedAt,
      status: derived.status,
      daysRemaining: derived.daysRemaining,
      verification: d.verification,
      verificationLabel:
        d.verification === "user_provided" ? "User provided · not verified with an authority" : "Not verified",
      hasFile: Boolean(d.storedName),
      fileName: d.fileName,
      mime: d.mime,
      note: d.note,
      source: d.source,
    };
  });

  const violations = input.violations
    .map((v) => viewViolation(v, input.evidence, input.vehicles, now))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const vehicles: VehicleView[] = input.vehicles.map((v) => {
    const compliance = compliancePercent(input.documents, v.id, now);
    const related = violations.filter((x) => x.vehicleId === v.id);
    const open = related.filter((x) => violationAffectsTraffic(x.status)).length;
    const overdue = related.filter((x) => x.status === "overdue").length;
    const expiredRequired = documents.filter(
      (d) =>
        d.vehicleId === v.id &&
        d.status === "expired" &&
        (d.kind === "insurance" || d.kind === "roadworthiness" || d.kind === "registration"),
    ).length;
    const standing = vehicleStanding({ compliance, openViolations: open, overdue, expiredRequired });
    return {
      id: v.id,
      plate: v.plate,
      make: v.make,
      model: v.model,
      year: v.year,
      colour: v.colour,
      name: [v.make, v.model].filter(Boolean).join(" "),
      compliance,
      standing,
      standingLabel: standingLabel(standing),
      trafficLabel: open === 0 ? "Clear" : `${open} open`,
      trafficTone: open === 0 ? "good" : "bad",
      dataClass: v.dataClass,
    };
  });

  const active = vehicles.find((v) => v.id === user.activeVehicleId) ?? vehicles[0] ?? null;
  const attention = buildAttention({
    now,
    documents: input.documents,
    violations: input.violations,
    transfers: input.transfers,
    score,
    sessions: personalSessions,
  });
  const blocking = attention.filter((a) => a.severity === "urgent" || a.severity === "attention");
  const primaryAttention = blocking[0] ?? attention[0] ?? null;
  const hero = heroFromAttention({ hasVehicle: vehicles.length > 0, primary: primaryAttention });

  const activeDocs = documents.filter((d) => !d.vehicleId || d.vehicleId === active?.id);
  const pill = (kind: string, label: string, href: string): StatusPill => {
    const doc = activeDocs.find((d) => d.kind === kind);
    if (!doc) return { id: kind, label, value: "Missing", tone: "bad", href };
    return {
      id: kind,
      label,
      value: docStatusLabel(doc.status),
      tone: statusTone(doc.status),
      href,
    };
  };

  const statuses: StatusPill[] = active
    ? [
        {
          id: "traffic",
          label: "Traffic",
          value: active.trafficLabel,
          tone: active.trafficTone,
          href: "/traffic",
        },
        pill("insurance", "Insurance", "/documents"),
        pill("roadworthiness", "Roadworthiness", "/documents"),
        pill("registration", "Registration", "/documents"),
      ]
    : [];

  const year = accraToday(now).slice(0, 4);
  const payments: PaymentView[] = input.payments.map((p) => ({
    id: p.id,
    violationId: p.violationId,
    amountGhs: p.amountGhs,
    paidOn: p.paidOn,
    reference: p.reference,
    note: p.note,
    source: p.source,
    title: violations.find((v) => v.id === p.violationId)?.title ?? "Payment",
  }));
  const paidThisYear = payments
    .filter((p) => p.paidOn.startsWith(year))
    .reduce((a, p) => a + p.amountGhs, 0);
  const outstanding = violations
    .filter((v) => v.status === "action_required" || v.status === "overdue" || v.status === "contest_in_preparation")
    .reduce((a, v) => a + (v.amountGhs ?? 0) + (v.lateEstimateGhs ?? 0), 0);

  const notifications = notificationsFromAttention({
    items: attention,
    plan: user.plan,
    nowIso: now.toISOString(),
    reads: input.reads,
    stored: input.notifications,
    prefs: user.prefs,
    userId: user.id,
  });

  const insights = buildInsights({ score, sessions: personalSessions });
  const violationsInSixMonths = input.violations.filter((v) => {
    const boundary = addDays(accraToday(now), -183);
    return v.occurredAt.slice(0, 10) >= boundary;
  });
  const expired = documents.some(
    (d) => d.status === "expired" && ["insurance", "roadworthiness", "registration", "licence"].includes(d.kind),
  );
  const expiringRequired = documents.some(
    (d) => d.status === "expiring" && ["insurance", "roadworthiness", "registration"].includes(d.kind),
  );
  const achievements = buildAchievements({
    month: scores.month,
    violations: input.violations,
    readyToDrive: vehicles.length > 0 && !expired && !expiringRequired && violations.every((v) => !violationAffectsTraffic(v.status)),
    cleanWindow: violationsInSixMonths.length === 0,
  });

  const checks = [
    { ok: active?.standing === "good" || active?.standing === "attention", label: active ? active.standingLabel : "No vehicle yet" },
    {
      ok: violations.every((v) => !violationAffectsTraffic(v.status)),
      label: outstanding > 0 ? `${ghs(outstanding)} still open` : "No outstanding fines",
    },
    {
      ok: !documents.some((d) => d.kind === "insurance" && (d.status === "expired" || d.status === "missing")),
      label: documents.some((d) => d.kind === "insurance" && d.status === "valid")
        ? "Insurance valid"
        : documents.some((d) => d.kind === "insurance")
          ? "Insurance needs a look"
          : "Insurance not added",
    },
  ];

  const one = attention.find((a) => a.severity !== "urgent") ?? null;
  const briefOne =
    hero.state === "urgent" && primaryAttention
      ? { title: primaryAttention.title, detail: primaryAttention.detail, href: primaryAttention.href }
      : one
        ? { title: one.title, detail: one.detail, href: one.href }
        : null;

  const timeline: TimelinePoint[] = documents
    .filter((d) => d.expiresOn && d.daysRemaining != null)
    .map((d) => ({
      id: d.id,
      label: d.label,
      date: d.expiresOn as string,
      days: d.daysRemaining as number,
      tone: statusTone(d.status),
    }))
    .sort((a, b) => a.days - b.days);

  let fleet: FleetView | null = null;
  if (input.fleet) {
    const extraSessions = input.fleetSessions ?? [];
    const allFleetSessions = [...input.sessions, ...extraSessions];
    const drivers = input.fleetDrivers.map((d) => {
      const linked = d.linkedVehicleId ? vehicles.find((v) => v.id === d.linkedVehicleId) : null;
      const driverScore = allWindows({
        sessions: allFleetSessions,
        violations: [],
        now,
        driverId: d.id,
        source: d.dataClass === "DEMO" ? "DEMO" : "CALCULATED",
      }).month;
      const open = linked ? violations.filter((v) => v.vehicleId === linked.id && violationAffectsTraffic(v.status)).length : 0;
      const standing = fleetStanding(driverScore.overall, open, linked?.compliance ?? null);
      const docTone = linked ? (linked.standing === "good" ? "good" : linked.standing === "high_risk" ? "bad" : "warn") : "info";
      return {
        id: d.id,
        name: d.name,
        plate: d.plate,
        vehicleLabel: d.vehicleLabel,
        linkedVehicleId: d.linkedVehicleId,
        notes: d.notes,
        score: driverScore,
        compliance: linked?.compliance ?? null,
        openViolations: open,
        documentStatus: linked ? linked.standingLabel : "Not linked",
        documentTone: docTone as StatusPill["tone"],
        standing,
        dataClass: d.dataClass,
        harshBrakes: allFleetSessions.filter((s) => s.driverId === d.id).reduce((a, s) => a + s.harshBrakes, 0),
        speedCompliance: driverScore.components?.speed ?? null,
      };
    });
    const counts = {
      total: drivers.length,
      good: drivers.filter((d) => d.standing === "good").length,
      attention: drivers.filter((d) => d.standing === "attention" || d.standing === "unknown").length,
      highRisk: drivers.filter((d) => d.standing === "high_risk").length,
    };
    fleet = {
      id: input.fleet.id,
      name: input.fleet.name,
      dataClass: input.fleet.dataClass,
      drivers,
      counts,
      sample: input.fleet.dataClass === "DEMO",
    };
  }

  const first = firstNameOf(user.name);

  return {
    mode: input.mode,
    dataClass: input.mode === "demo" ? "DEMO" : user.dataClass,
    generatedAt: now.toISOString(),
    viewer: {
      id: user.id,
      name: user.name,
      firstName: first,
      email: user.email,
      role: user.role,
      plan: user.plan,
      planStatus: user.planStatus,
      onboardingCompleted: user.onboardingCompleted,
    },
    entitlements: entitlementsFor(user.planStatus === "active" ? user.plan : "free"),
    greeting: greetingFor(now, first),
    dayLabel: dayLabel(now),
    hero,
    score,
    scores,
    activeVehicle: active,
    vehicles,
    statuses,
    primaryAttention: hero.state === "ready" ? attention[0] ?? null : primaryAttention,
    attention,
    documents,
    violations,
    payments,
    contests: input.contests,
    notifications,
    sessions: personalSessions.filter((s) => !s.simulated).map(sessionView),
    places: (input.places ?? []).map((place): PlaceView => ({
      id: place.id,
      slot: place.slot,
      name: place.name,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
    })),
    emergency: {
      driverName: user.name,
      plate: active?.plate ?? null,
      vehicle: active?.name ?? null,
      contactName: user.emergency?.contactName ?? "",
      contactPhone: user.emergency?.contactPhone ?? "",
      insurerName: user.emergency?.insurerName ?? "",
      insurerPhone: user.emergency?.insurerPhone ?? "",
      bloodGroup: user.emergency?.bloodGroup ?? "",
      medicalNote: user.emergency?.medicalNote ?? "",
    },
    expenses: (input.expenses ?? []).map((row) => ({
      id: row.id,
      kind: row.kind,
      direction: row.direction,
      amountGhs: row.amountGhs,
      spentOn: row.spentOn,
      note: row.note,
      source: row.source,
    })),
    insights,
    achievements,
    brief: {
      ready: hero.state === "ready",
      headline: hero.title,
      checks,
      oneThing: briefOne,
    },
    fleet,
    prefs: user.prefs,
    transfers: input.transfers,
    questions: input.questions,
    timeline,
    connectivity: {
      liveTraffic: false,
      officialViolations: false,
      officialPayments: false,
      ocr: false,
      checkout: false,
    },
    totals: {
      outstandingGhs: outstanding,
      activeViolations: violations.filter((v) => violationAffectsTraffic(v.status)).length,
      paidThisYearGhs: paidThisYear,
    },
  };
}

export function emptyDatabase(): Database {
  return {
    users: [],
    credentials: [],
    vehicles: [],
    documents: [],
    violations: [],
    evidence: [],
    payments: [],
    contests: [],
    sessions: [],
    notifications: [],
    reads: [],
    fleets: [],
    fleetDrivers: [],
    transfers: [],
    questions: [],
    audit: [],
    places: [],
    expenses: [],
  };
}

export function deadlineLabel(days: number | null, confirmed: boolean): string {
  if (!confirmed || days == null) return "Confirm the date on your notice";
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} past the date you confirmed`;
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} remaining`;
}

export function describeTimeline(points: TimelinePoint[]): { label: string; title: string }[] {
  return points.map((p) => ({
    label: p.days < 0 ? `${Math.abs(p.days)} days ago` : p.days === 0 ? "Today" : `${p.days} days`,
    title: `${p.label} · ${formatDay(p.date)}`,
  }));
}
