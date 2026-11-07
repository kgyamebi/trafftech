import { daysUntil } from "./dates";
import { documentStatus } from "./compliance";
import type {
  AttentionItem,
  AttentionType,
  DocumentRecord,
  DrivingSessionRecord,
  ScoreView,
  TransferRecord,
  ViolationRecord,
} from "./types";

const KIND_TYPE: Record<string, AttentionType> = {
  insurance: "INSURANCE_EXPIRING",
  roadworthiness: "ROADWORTHINESS_EXPIRING",
  registration: "REGISTRATION_EXPIRING",
  licence: "LICENCE_EXPIRING",
};

function item(partial: AttentionItem): AttentionItem {
  return { ...partial, score: partial.importance * 0.45 + partial.urgency * 0.55 };
}

export function buildAttention(input: {
  now: Date;
  documents: DocumentRecord[];
  violations: ViolationRecord[];
  transfers: TransferRecord[];
  score: ScoreView;
  sessions: DrivingSessionRecord[];
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const doc of input.documents) {
    const derived = documentStatus(doc.expiresOn, input.now);
    const type = KIND_TYPE[doc.kind];
    if (!type || derived.daysRemaining == null) {
      if (!doc.expiresOn && ["insurance", "roadworthiness", "registration", "licence"].includes(doc.kind)) {
        items.push(
          item({
            id: `missing-date:${doc.id}`,
            type: "DOCUMENT_MISSING",
            severity: "attention",
            category: "Vehicle",
            title: `${doc.label} needs an expiry date`,
            detail: "The date is how Nokware knows whether you can drive with it.",
            deadline: null,
            importance: 70,
            urgency: 55,
            recommendedAction: "Add the expiry date printed on the document.",
            href: "/documents",
            source: doc.source === "DEMO" ? "DEMO" : "USER_PROVIDED",
            score: 0,
          }),
        );
      }
      continue;
    }
    const days = derived.daysRemaining;
    if (days < 0) {
      items.push(
        item({
          id: `expired:${doc.id}`,
          type: "DOCUMENT_EXPIRED",
          severity: "urgent",
          category: "Vehicle",
          title: `${doc.label} has expired`,
          detail: `The date you saved was ${doc.expiresOn}.`,
          deadline: doc.expiresOn,
          importance: 96,
          urgency: 98,
          recommendedAction: "Renew it with the issuing organisation, then update the date here.",
          href: "/documents",
          source: doc.source === "DEMO" ? "DEMO" : "CALCULATED",
          score: 0,
        }),
      );
    } else if (days <= 45) {
      const severity = days <= 7 ? "attention" : "info";
      const urgency = days <= 7 ? 80 : days <= 21 ? 58 : 40;
      items.push(
        item({
          id: `expiring:${doc.id}`,
          type,
          severity,
          category: "Vehicle",
          title: days === 0 ? `${doc.label} expires today` : `${doc.label} expires in ${days} day${days === 1 ? "" : "s"}`,
          detail: "Saved from the date on your document. Not a government check.",
          deadline: doc.expiresOn,
          importance: days <= 14 ? 78 : 60,
          urgency,
          recommendedAction: "Open the vehicle record and plan the renewal.",
          href: "/vehicle",
          source: doc.source === "DEMO" ? "DEMO" : "CALCULATED",
          score: 0,
        }),
      );
    }
  }

  for (const v of input.violations) {
    if (v.status === "paid_user_reported" || v.status === "closed") continue;
    const days = v.deadline && v.deadlineConfirmed ? daysUntil(v.deadline, input.now) : null;
    const overdue = days != null && days < 0;
    items.push(
      item({
        id: `violation:${v.id}`,
        type: overdue || (days != null && days <= 14) ? "FINE_DEADLINE" : "NEW_VIOLATION",
        severity: "urgent",
        category: "Traffic",
        title: overdue ? `${v.title} is past the date you confirmed` : `${v.title} needs a decision`,
        detail:
          v.amountGhs != null
            ? `GH₵${v.amountGhs} on the notice you saved.${days != null ? ` ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ${overdue ? "past" : "remaining"}.` : ""}`
            : "An amount was not saved with this notice.",
        deadline: v.deadline,
        importance: 100,
        urgency: overdue ? 100 : days == null ? 72 : Math.min(100, 70 + (14 - days) * 2),
        recommendedAction: "Review the notice, the evidence you have, and the published payment or contest paths.",
        href: `/traffic/${v.id}`,
        source: v.source === "DEMO" ? "DEMO" : "CALCULATED",
        score: 0,
      }),
    );
  }

  for (const transfer of input.transfers) {
    if (!transfer.sold) continue;
    if (transfer.ownershipUpdate !== "user_says_submitted") {
      items.push(
        item({
          id: `transfer:${transfer.id}`,
          type: "VEHICLE_TRANSFER_PENDING",
          severity: "attention",
          category: "Vehicle",
          title: "Ownership update is still open",
          detail: "Nokware cannot file a DVLA transfer. The checklist only tracks what you have gathered.",
          deadline: null,
          importance: 64,
          urgency: 48,
          recommendedAction: "Open the transfer checklist and confirm what you have done outside the app.",
          href: `/vehicle/${transfer.vehicleId}/transfer`,
          source: "USER_PROVIDED",
          score: 0,
        }),
      );
    }
  }

  if (input.score.status === "ready" && input.score.overall != null && input.score.components) {
    if (input.score.overall < 60 || input.score.components.speed < 70) {
      items.push(
        item({
          id: "pattern:high-risk",
          type: "HIGH_RISK_DRIVING_PATTERN",
          severity: "attention",
          category: "Safety",
          title: "Recent driving is outside a safe pattern",
          detail: "The score is calculated from your own sessions. It is an invitation to slow down, not a route around enforcement.",
          deadline: null,
          importance: 84,
          urgency: 70,
          recommendedAction: "Review the speed-compliance breakdown and choose a lower pace next time.",
          href: "/score",
          source: "CALCULATED",
          score: 0,
        }),
      );
    } else if (input.score.components.braking < 80) {
      items.push(
        item({
          id: "pattern:braking",
          type: "SAFETY_PATTERN",
          severity: "info",
          category: "Safety",
          title: "Harsh braking is pulling the score down",
          detail: `${input.score.components.braking} on smooth braking for this period.`,
          deadline: null,
          importance: 48,
          urgency: 30,
          recommendedAction: "Leave more space so you can slow earlier.",
          href: "/score",
          source: "CALCULATED",
          score: 0,
        }),
      );
    }
  }

  return items.sort((a, b) => b.score - a.score);
}

export function heroFromAttention(input: {
  hasVehicle: boolean;
  primary: AttentionItem | null;
}): { state: "setup" | "ready" | "attention" | "urgent"; title: string; subtitle: string } {
  if (!input.hasVehicle) {
    return {
      state: "setup",
      title: "Add a vehicle to begin.",
      subtitle: "Status, documents and fines all hang off the car you actually drive.",
    };
  }
  const primary = input.primary;
  if (!primary || primary.severity === "info" || primary.severity === "positive") {
    return {
      state: "ready",
      title: "You're ready to drive.",
      subtitle: primary ? "One thing is worth knowing before you go." : "Nothing in your records needs a decision today.",
    };
  }
  if (primary.severity === "urgent") {
    return {
      state: "urgent",
      title: primary.title,
      subtitle: primary.detail,
    };
  }
  return {
    state: "attention",
    title: primary.title,
    subtitle: primary.detail,
  };
}
