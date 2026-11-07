import type { Entitlements, PlanId } from "./types";

export function entitlementsFor(plan: PlanId): Entitlements {
  if (plan === "fleet") {
    return {
      plan,
      maxVehicles: 200,
      ai: true,
      fleet: true,
      historicalAnalytics: true,
      extraReminders: true,
      evidenceNotes: true,
    };
  }
  if (plan === "pro") {
    return {
      plan,
      maxVehicles: 5,
      ai: true,
      fleet: false,
      historicalAnalytics: true,
      extraReminders: true,
      evidenceNotes: true,
    };
  }
  return {
    plan: "free",
    maxVehicles: 1,
    ai: false,
    fleet: false,
    historicalAnalytics: false,
    extraReminders: false,
    evidenceNotes: true,
  };
}

export function canAddVehicle(plan: PlanId, current: number): { ok: boolean; reason: string } {
  const max = entitlementsFor(plan).maxVehicles;
  if (current >= max) {
    return {
      ok: false,
      reason:
        plan === "free"
          ? "Free includes one vehicle. Pro holds up to five. No charge has been made."
          : `This plan holds ${max} vehicles.`,
    };
  }
  return { ok: true, reason: "" };
}

export function activePlanLine(entitlements: Entitlements): string {
  const items = [
    entitlements.maxVehicles === 1 ? "1 vehicle" : `${entitlements.maxVehicles} vehicles`,
    entitlements.historicalAnalytics ? "six-month score history" : "the current score windows",
    entitlements.extraReminders ? "earlier document reminders" : "30- and 7-day reminders",
  ];
  if (entitlements.ai) items.push("Driver Intelligence");
  if (entitlements.fleet) items.push("a fleet dashboard");
  return `On this account today: ${items.join(", ")}. Requesting a plan does not charge anyone, and a paid plan stays inactive until checkout exists.`;
}

export function reminderLeads(plan: PlanId): number[] {
  return entitlementsFor(plan).extraReminders ? [45, 30, 14, 7, 1, 0] : [30, 7, 0];
}
