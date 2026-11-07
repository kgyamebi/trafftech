import { daysUntil } from "./dates";
import type { DerivedDocStatus, DocumentKind, DocumentRecord, Tone, ViolationView } from "./types";

export const EXPIRING_DAYS = 30;

const REQUIRED: DocumentKind[] = ["insurance", "roadworthiness", "registration"];

export function documentStatus(expiresOn: string | null, now: Date): {
  status: DerivedDocStatus;
  daysRemaining: number | null;
} {
  if (!expiresOn) return { status: "unknown", daysRemaining: null };
  const days = daysUntil(expiresOn, now);
  if (days == null) return { status: "unknown", daysRemaining: null };
  if (days < 0) return { status: "expired", daysRemaining: days };
  if (days <= EXPIRING_DAYS) return { status: "expiring", daysRemaining: days };
  return { status: "valid", daysRemaining: days };
}

export function statusTone(status: DerivedDocStatus | string): Tone {
  if (status === "valid" || status === "CLEAR" || status === "good" || status === "paid_user_reported" || status === "closed")
    return "good";
  if (status === "expiring" || status === "attention" || status === "contest_in_preparation") return "warn";
  if (status === "expired" || status === "overdue" || status === "action_required" || status === "high_risk" || status === "missing")
    return "bad";
  if (status === "unknown") return "info";
  return "neutral";
}

function pointsFor(status: DerivedDocStatus, days: number | null): number | null {
  if (status === "valid") return 100;
  if (status === "expiring") {
    if (days == null) return 80;
    if (days <= 7) return 70;
    if (days <= 14) return 78;
    return 88;
  }
  if (status === "expired" || status === "missing") return 0;
  return null;
}

export function compliancePercent(
  documents: Pick<DocumentRecord, "kind" | "expiresOn" | "vehicleId">[],
  vehicleId: string,
  now: Date,
): number | null {
  const scores = REQUIRED.map((kind) => {
    const doc = documents.find((d) => d.vehicleId === vehicleId && d.kind === kind);
    if (!doc) return 0;
    const derived = documentStatus(doc.expiresOn, now);
    return pointsFor(derived.status, derived.daysRemaining) ?? 0;
  });
  if (scores.every((s) => s === 0) && REQUIRED.every((k) => !documents.some((d) => d.vehicleId === vehicleId && d.kind === k))) {
    return null;
  }
  return Math.round(scores.reduce((a, b) => a + b, 0) / REQUIRED.length);
}

export function vehicleStanding(input: {
  compliance: number | null;
  openViolations: number;
  overdue: number;
  expiredRequired: number;
}): "good" | "attention" | "high_risk" | "unknown" {
  if (input.compliance == null) return "unknown";
  if (input.overdue > 0 || input.expiredRequired > 0 || input.compliance < 50) return "high_risk";
  if (input.openViolations > 0 || input.compliance < 90) return "attention";
  return "good";
}

export function standingLabel(standing: "good" | "attention" | "high_risk" | "unknown"): string {
  if (standing === "good") return "Good standing";
  if (standing === "attention") return "Needs attention";
  if (standing === "high_risk") return "High risk";
  return "Not enough documents";
}

export function docStatusLabel(status: DerivedDocStatus): string {
  if (status === "valid") return "Valid";
  if (status === "expiring") return "Expiring";
  if (status === "expired") return "Expired";
  if (status === "missing") return "Missing";
  return "Date needed";
}

export function violationAffectsTraffic(status: ViolationView["status"]): boolean {
  return status === "action_required" || status === "overdue" || status === "contest_in_preparation";
}
