import { SPEED_UNAVAILABLE } from "./navigation";

export type ProtectionStatus = "SAFE" | "APPROACHING LIMIT" | "ABOVE LIMIT" | "UNKNOWN";

export function liveStatus(speedKph: number | null, limitKph: number | null): ProtectionStatus {
  if (speedKph == null || limitKph == null) return "UNKNOWN";
  if (speedKph > limitKph + 1) return "ABOVE LIMIT";
  if (speedKph >= limitKph - 1) return "APPROACHING LIMIT";
  return "SAFE";
}

export interface ProtectionInput {
  speedCompliance: number | null;
  braking: number | null;
  acceleration: number | null;
  documentCompliance: number | null;
  vehicleStanding: "good" | "attention" | "high_risk" | "unknown" | null;
  activeViolations: number;
  overdueViolations: number;
  outstandingGhs: number;
  expiredRequired: number;
  focusTitle: string | null;
}

export interface AwarenessFact {
  kind: string;
  title: string;
  detail: string;
  confidence: "low" | "high" | "scripted" | "none";
  source: string;
  at: string;
}

const EMPTY: ProtectionInput = {
  speedCompliance: null,
  braking: null,
  acceleration: null,
  documentCompliance: null,
  vehicleStanding: null,
  activeViolations: 0,
  overdueViolations: 0,
  outstandingGhs: 0,
  expiredRequired: 0,
  focusTitle: null,
};

export class DriverProtectionEngine {
  constructor(private input: ProtectionInput = EMPTY) {}

  score(): {
    value: number | null;
    band: "Excellent" | "Good" | "Needs attention" | "At risk" | null;
    factors: { label: string; value: number | null; note: string }[];
    note: string;
  } {
    const behaviour = average([this.input.braking, this.input.acceleration]);
    const readiness =
      this.input.vehicleStanding === "good"
        ? 100
        : this.input.vehicleStanding === "attention"
          ? 70
          : this.input.vehicleStanding === "high_risk"
            ? 30
            : null;
    const notices = this.input.overdueViolations > 0 ? 0 : this.input.activeViolations > 0 ? 40 : 100;
    const factors = [
      factor("Speed compliance", this.input.speedCompliance, "From saved driving samples."),
      factor("Document compliance", this.input.documentCompliance, "From the dates saved on the papers."),
      factor("Vehicle readiness", readiness, "From the saved vehicle standing."),
      factor("Violation status", notices, this.input.activeViolations === 0 ? "No open notice." : "Open notices are saved."),
      factor("Driver behaviour", behaviour, "From saved braking and acceleration."),
    ];
    const measured = factors.filter((item) => item.value != null);
    if (measured.length < 2) {
      return { value: null, band: null, factors, note: "Not enough records for a protection score." };
    }
    const value = Math.round(measured.reduce((sum, item) => sum + (item.value ?? 0), 0) / measured.length);
    const band = value >= 90 ? "Excellent" : value >= 75 ? "Good" : value >= 60 ? "Needs attention" : "At risk";
    return {
      value,
      band,
      factors,
      note: "Calculated from saved driving, papers, and notices. It is not a forecast, and it is not the driver score.",
    };
  }

  savings(): { lines: string[]; amountGhs: number | null; amountNote: string } {
    const lines = [
      this.input.expiredRequired === 0 ? "No missed renewals." : "A saved document is already past its date.",
      "No late penalty is saved on this account.",
      this.input.activeViolations === 0 ? "No active violations." : `${this.input.activeViolations} open notice${this.input.activeViolations === 1 ? "" : "s"}.`,
    ];
    if (this.input.outstandingGhs > 0) {
      return {
        lines,
        amountGhs: this.input.outstandingGhs,
        amountNote: "Amount written on open notices you saved. Not money already kept, and not a forecast.",
      };
    }
    return { lines, amountGhs: null, amountNote: "No open amount is saved." };
  }

  awareness(facts: AwarenessFact[] = []): AwarenessFact[] {
    return facts.filter((fact) => fact.confidence !== "none" && fact.source.trim() && fact.at.trim() && fact.title.trim());
  }

  roadNote(): string {
    return "School zones, markets, hospitals, floods, closures, and road-surface reports are not connected. A warning is shown only with a source, a confidence, and a time.";
  }

  now(input: {
    speedKph: number | null;
    limitKph: number | null;
    limitSource: string;
    upcoming: { kph: number; metres: number; source: string; note: string } | null;
  }): { status: ProtectionStatus; headline: string; speech: string | null } {
    const status = liveStatus(input.speedKph, input.limitKph);
    if (status === "ABOVE LIMIT" && input.limitSource === "user_declared") {
      return { status, headline: "GPS speed is above the limit you set.", speech: "Reduce speed. GPS speed is above the limit you set." };
    }
    if (status === "ABOVE LIMIT" && input.limitSource === "openstreetmap") {
      return { status, headline: "GPS speed is above the mapped limit for this road.", speech: "Reduce speed. GPS speed is above the mapped limit for this road. The posted sign controls." };
    }
    if (status === "ABOVE LIMIT") {
      return { status, headline: "The shown speed is above the shown limit.", speech: null };
    }
    if (input.upcoming) {
      return {
        status,
        headline: `Limit change ahead. ${input.upcoming.kph} km/h in ${input.upcoming.metres} m.`,
        speech: input.upcoming.source === "demo_script" ? null : `Limit change ahead. ${input.upcoming.kph}.`,
      };
    }
    if (this.input.focusTitle) {
      return { status, headline: this.input.focusTitle, speech: null };
    }
    if (status === "SAFE" && input.limitSource === "openstreetmap") {
      return { status, headline: "GPS speed is inside the mapped limit for this road.", speech: null };
    }
    if (status === "SAFE") return { status, headline: "You are inside the limit you set.", speech: null };
    if (input.limitKph == null) return { status, headline: `${SPEED_UNAVAILABLE}.`, speech: null };
    return { status, headline: "GPS speed unavailable.", speech: null };
  }
}

function average(values: (number | null)[]): number | null {
  const ready = values.filter((value): value is number => value != null);
  if (!ready.length) return null;
  return Math.round(ready.reduce((sum, value) => sum + value, 0) / ready.length);
}

function factor(label: string, value: number | null, note: string): { label: string; value: number | null; note: string } {
  return { label, value, note: value == null ? "Not recorded." : note };
}
