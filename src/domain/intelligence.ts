import { clamp } from "./dates";
import { ACCEL_PENALTY, BRAKE_PENALTY, MIN_MINUTES, MIN_SAMPLES } from "./score";
import type { DataSource, ScoreComponents, Severity, Workspace } from "./types";
import type { NavAlert } from "./navigation";

export interface IntelligenceContext {
  mode: "user" | "demo";
  heroState: "setup" | "ready" | "attention" | "urgent";
  heroTitle: string;
  attention: {
    title: string;
    detail: string;
    href: string;
    severity: Severity;
    source: DataSource;
    recommendedAction: string;
  }[];
  scoreStatus: "ready" | "insufficient";
  scoreOverall: number | null;
  scoreNote: string;
  components: ScoreComponents | null;
}

export interface ReadinessReport {
  state: "READY" | "ATTENTION REQUIRED" | "SETUP";
  title: string;
  actions: { title: string; detail: string; href: string; source: DataSource }[];
  notices: { title: string; href: string; source: DataSource }[];
  source: "CALCULATED" | "DEMO";
}

export interface TripFacts {
  demo: boolean;
  minutes: number;
  samples: number;
  compliance: number | null;
  harshBrakes: number;
  harshAccels: number;
  events: string[];
}

export interface TripIntelligence {
  compliance: number | null;
  quality: number | null;
  qualityNote: string;
  brakingEvents: number;
  accelerationEvents: number;
  trafficSummary: string;
  improvements: string[];
  scoreImpact: string;
  source: "CALCULATED" | "DEMO";
}

export interface RoadFact {
  id: string;
  title: string;
  detail: string;
  source: "demo_script";
  confidence: "scripted";
  at: string;
}

const COMPONENT_NAMES: Record<keyof ScoreComponents, string> = {
  speed: "speed compliance",
  braking: "smooth braking",
  acceleration: "smooth acceleration",
  traffic: "traffic compliance",
  consistency: "consistency",
};

export class DriverIntelligenceEngine {
  constructor(private readonly context: IntelligenceContext) {}

  static fromWorkspace(ws: Pick<Workspace, "mode" | "hero" | "attention" | "score">): DriverIntelligenceEngine {
    return new DriverIntelligenceEngine({
      mode: ws.mode,
      heroState: ws.hero.state,
      heroTitle: ws.hero.title,
      attention: ws.attention.map((item) => ({
        title: item.title,
        detail: item.detail,
        href: item.href,
        severity: item.severity,
        source: item.source,
        recommendedAction: item.recommendedAction,
      })),
      scoreStatus: ws.score.status,
      scoreOverall: ws.score.overall,
      scoreNote: ws.score.note,
      components: ws.score.components,
    });
  }

  private source(): "CALCULATED" | "DEMO" {
    return this.context.mode === "demo" ? "DEMO" : "CALCULATED";
  }

  readiness(): ReadinessReport {
    if (this.context.heroState === "setup") {
      return { state: "SETUP", title: this.context.heroTitle, actions: [], notices: [], source: this.source() };
    }
    const blocking = this.context.attention.filter((item) => item.severity === "urgent" || item.severity === "attention").slice(0, 3);
    if (this.context.heroState === "urgent" || this.context.heroState === "attention") {
      return {
        state: "ATTENTION REQUIRED",
        title: this.context.heroTitle,
        actions: blocking.map((item) => ({
          title: item.title,
          detail: item.recommendedAction || item.detail,
          href: item.href,
          source: item.source,
        })),
        notices: [],
        source: this.source(),
      };
    }
    const notices = this.context.attention
      .filter((item) => item.severity === "info")
      .slice(0, 1)
      .map((item) => ({ title: item.title, href: item.href, source: item.source }));
    return { state: "READY", title: "Ready to drive.", actions: [], notices, source: this.source() };
  }

  scoreFactors(): { label: string; value: number | null; note: string }[] {
    return scoreFactorRows({ status: this.context.scoreStatus, components: this.context.components });
  }

  coaching(): string[] {
    if (this.context.scoreStatus !== "ready" || !this.context.components || this.context.scoreOverall == null) {
      return ["Not enough driving history."];
    }
    const entries = Object.entries(this.context.components) as [keyof ScoreComponents, number][];
    const weakest = entries.sort((a, b) => a[1] - b[1])[0];
    return [`${COMPONENT_NAMES[weakest[0]][0].toUpperCase()}${COMPONENT_NAMES[weakest[0]].slice(1)} is the weakest part of the calculated score, at ${weakest[1]}.`];
  }

  trend(previous: number | null): string | null {
    if (this.context.scoreOverall == null || previous == null) return null;
    const delta = this.context.scoreOverall - previous;
    if (delta === 0) return `The calculated score is unchanged at ${this.context.scoreOverall}.`;
    const direction = delta > 0 ? "higher" : "lower";
    return `The calculated score is ${Math.abs(delta)} points ${direction} than the earlier window.`;
  }

  assessTrip(facts: TripFacts, trafficNote: string): TripIntelligence {
    const source = facts.demo ? "DEMO" : "CALCULATED";
    const quality = tripQuality(facts);
    const improvements: string[] = [];
    if (facts.compliance != null && facts.compliance < 90) {
      improvements.push("Part of this trip was above the limit in use.");
    }
    if (facts.harshBrakes > 0) improvements.push("Leave more space so you can slow earlier.");
    if (facts.harshAccels > 0) improvements.push("Build speed more gradually.");
    let scoreImpact = "This trip does not change your driver score on its own. A score needs 30 minutes and 20 speed samples.";
    if (facts.demo) scoreImpact = "This demonstration does not change your driver score.";
    else if (facts.samples >= MIN_SAMPLES && facts.minutes >= MIN_MINUTES && facts.compliance != null) {
      scoreImpact = "These samples can be included the next time your driver score is calculated.";
    } else if (facts.compliance == null) {
      scoreImpact = "No speed limit was available, so this trip does not change your driver score.";
    }
    return {
      compliance: facts.compliance,
      quality,
      qualityNote: quality == null
        ? "Not enough on this trip to score driving quality."
        : "Calculated from this trip only. It is not your driver score, and it does not include a traffic-compliance component.",
      brakingEvents: facts.harshBrakes,
      accelerationEvents: facts.harshAccels,
      trafficSummary: trafficNote,
      improvements,
      scoreImpact,
      source,
    };
  }
}

export interface DriverStatusChip {
  label: "READY TO DRIVE" | "ACTION REQUIRED" | "URGENT" | "SET UP";
  message: string;
  href: string;
  action: string;
}

export function driverStatusChip(input: {
  heroState: "setup" | "ready" | "attention" | "urgent";
  heroTitle: string;
  vehicle: { id: string; standingLabel: string } | null;
  focus: { title: string; href: string } | null;
}): DriverStatusChip {
  if (input.heroState === "setup") {
    return { label: "SET UP", message: input.heroTitle, href: "/vehicle/new", action: "Add a vehicle" };
  }
  if (input.heroState === "urgent") {
    return {
      label: "URGENT",
      message: input.focus?.title || input.heroTitle,
      href: input.focus?.href || "/traffic",
      action: "Review",
    };
  }
  if (input.heroState === "attention") {
    return {
      label: "ACTION REQUIRED",
      message: input.focus?.title || input.heroTitle,
      href: input.focus?.href || "/vehicle",
      action: "Review",
    };
  }
  return {
    label: "READY TO DRIVE",
    message: input.vehicle?.standingLabel === "Good standing" ? "Everything looks good." : (input.vehicle?.standingLabel ?? "No vehicle saved"),
    href: input.vehicle ? `/vehicle/${input.vehicle.id}` : "/vehicle/new",
    action: "Vehicle",
  };
}

export interface OpeningCard {
  label: "READY TO DRIVE" | "ACTION REQUIRED" | "URGENT" | "SET UP";
  message: string;
  href: string;
  action: string;
  score: number | null;
  checks: { label: string }[] | null;
  demo: boolean;
}

function openingAction(href: string): string {
  if (href.startsWith("/documents")) return "See the date";
  if (href.startsWith("/traffic")) return "See the notice";
  if (href === "/vehicle/new") return "Add a vehicle";
  if (href.startsWith("/vehicle")) return "See the vehicle";
  return "Review";
}

export function openingCard(input: {
  heroState: "setup" | "ready" | "attention" | "urgent";
  heroTitle: string;
  greeting: string;
  vehicle: { id: string; standing: string } | null;
  documents: { kind: string; status: string; vehicleId: string | null }[];
  activeViolations: number;
  score: number | null;
  focus: { title: string; href: string } | null;
  demo: boolean;
}): OpeningCard {
  const vehicleHref = input.vehicle ? `/vehicle/${input.vehicle.id}` : "/vehicle/new";
  if (input.heroState === "setup") {
    return { label: "SET UP", message: input.heroTitle, href: "/vehicle/new", action: "Add a vehicle", score: null, checks: null, demo: input.demo };
  }
  if (input.heroState === "urgent") {
    const href = input.focus?.href || "/traffic";
    return {
      label: "URGENT",
      message: input.focus?.title || input.heroTitle,
      href,
      action: openingAction(href),
      score: null,
      checks: null,
      demo: input.demo,
    };
  }
  if (input.heroState === "attention") {
    const href = input.focus?.href || "/vehicle";
    return {
      label: "ACTION REQUIRED",
      message: input.focus?.title || input.heroTitle,
      href,
      action: openingAction(href),
      score: null,
      checks: null,
      demo: input.demo,
    };
  }
  const valid = (kind: string) =>
    input.documents.some((doc) => doc.kind === kind && doc.vehicleId === input.vehicle?.id && doc.status === "valid");
  const clear = Boolean(input.vehicle && input.vehicle.standing === "good" && valid("insurance") && valid("roadworthiness") && input.activeViolations === 0 && !input.focus);
  if (!clear) {
    return {
      label: "READY TO DRIVE",
      message: input.focus?.title || input.heroTitle,
      href: input.focus?.href || vehicleHref,
      action: openingAction(input.focus?.href || vehicleHref),
      score: null,
      checks: null,
      demo: input.demo,
    };
  }
  return {
    label: "READY TO DRIVE",
    message: `${input.greeting}. You're ready to drive.`,
    href: vehicleHref,
    action: "Vehicle",
    score: input.score,
    checks: [
      { label: "Vehicle good" },
      { label: "Insurance valid" },
      { label: "Roadworthiness valid" },
      { label: "No active violations" },
    ],
    demo: input.demo,
  };
}

export function driverHealth(input: {
  driverScore: number | null;
  vehicleCompliance: number | null;
  openObligations: number;
}): {
  overall: number | null;
  band: "Excellent" | "Good" | "Moderate" | "High Risk" | "Critical" | null;
  note: string;
  source: "CALCULATED";
  factors: { label: string; value: number | null; note: string }[];
} {
  const measured = [input.driverScore, input.vehicleCompliance].filter((value): value is number => value != null);
  const overall = measured.length ? Math.round(measured.reduce((sum, value) => sum + value, 0) / measured.length) : null;
  const band = overall == null ? null : overall >= 90 ? "Excellent" : overall >= 75 ? "Good" : overall >= 60 ? "Moderate" : overall >= 40 ? "High Risk" : "Critical";
  return {
    overall,
    band,
    source: "CALCULATED",
    note: measured.length === 0
      ? "Not enough records."
      : measured.length === 1
        ? "Partial. Only one measured factor is on this account. Cornering and road risk are not recorded."
        : "Calculated from the driver score and vehicle compliance already saved. Cornering and road risk are not recorded.",
    factors: [
      { label: "Driving behaviour", value: input.driverScore, note: input.driverScore == null ? "Not enough driving history." : "CALCULATED" },
      { label: "Vehicle compliance", value: input.vehicleCompliance, note: input.vehicleCompliance == null ? "No compliance figure yet." : "CALCULATED" },
      { label: "Outstanding obligations", value: null, note: input.openObligations === 0 ? "None open." : `${input.openObligations} open. Not turned into a score.` },
      { label: "Cornering", value: null, note: "Not recorded." },
      { label: "Road risk exposure", value: null, note: "Not recorded." },
    ],
  };
}

export function fleetHealth(scores: (number | null)[]): { overall: number | null; note: string } {
  const ready = scores.filter((value): value is number => value != null);
  if (!ready.length) return { overall: null, note: "Not enough driver scores to rank a fleet." };
  const overall = Math.round(ready.reduce((sum, value) => sum + value, 0) / ready.length);
  return { overall, note: `Calculated from ${ready.length} driver score${ready.length === 1 ? "" : "s"}.` };
}

export function oneUpcoming(
  items: { title: string; href: string; severity: string }[],
  insight: string | null,
): { title: string; href: string } | null {
  const blocking = items.find((item) => item.severity === "urgent" || item.severity === "attention");
  if (blocking) return { title: blocking.title, href: blocking.href };
  const info = items.find((item) => item.severity === "info");
  if (info) return { title: info.title, href: info.href };
  if (insight) return { title: insight, href: "/score" };
  return null;
}

export function scoreFactorRows(input: {
  status: string;
  components: { speed: number; braking: number; acceleration: number; traffic: number; consistency: number } | null;
}): { label: string; value: number | null; note: string }[] {
  const measured = input.status === "ready" && input.components != null;
  const components = input.components;
  const row = (label: string, value: number | null) => ({
    label,
    value: measured ? value : null,
    note: measured ? "CALCULATED" : "Not enough driving history.",
  });
  return [
    row("Speed compliance", components?.speed ?? null),
    row("Smooth braking", components?.braking ?? null),
    row("Smooth acceleration", components?.acceleration ?? null),
    row("Consistency", components?.consistency ?? null),
    { label: "Attention events", value: null, note: "Not recorded." },
    { label: "Driving efficiency", value: null, note: "Not recorded." },
    { label: "Cornering", value: null, note: "Not recorded." },
    { label: "Road risk exposure", value: null, note: "Not recorded." },
    { label: "Driver improvement", value: null, note: "Not recorded." },
    row("Traffic compliance", components?.traffic ?? null),
  ];
}

export function tripQuality(facts: TripFacts): number | null {
  if (facts.compliance == null || facts.samples < 2) return null;
  const braking = clamp(Math.round(100 - facts.harshBrakes * BRAKE_PENALTY), 0, 100);
  const acceleration = clamp(Math.round(100 - facts.harshAccels * ACCEL_PENALTY), 0, 100);
  return Math.round(facts.compliance * 0.5 + braking * 0.25 + acceleration * 0.25);
}

export function roadFacts(alert: NavAlert | null, at: string): RoadFact[] {
  if (!alert || alert.source !== "demo_script") return [];
  if (/route/i.test(alert.title)) return [];
  return [{
    id: alert.id,
    title: alert.title,
    detail: alert.detail,
    source: "demo_script",
    confidence: "scripted",
    at,
  }];
}
