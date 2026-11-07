import type { PlanId } from "@/domain/types";

/** Operator pricing. Change figures here. Screens must not duplicate them.
 * checkoutConnected stays false until a real payment provider is wired. */
export const pricingConfig = {
  currency: "GHS" as const,
  checkoutConnected: false,
  plans: [
    {
      id: "free" as PlanId,
      name: "Free",
      monthly: 0,
      yearly: 0,
      blurb: "The command centre, one vehicle, and the alerts that keep you legal.",
      features: [
        "Home status and daily brief",
        "One vehicle and its documents",
        "Basic driver score",
        "Urgent alerts and 30- and 7-day reminders",
        "Violation notes you import yourself",
      ],
    },
    {
      id: "pro" as PlanId,
      name: "Pro",
      monthly: 45,
      yearly: 450,
      blurb: "History, Ask Driver Intelligence, and room for a small garage.",
      features: [
        "Up to five vehicles",
        "Ask Driver Intelligence",
        "Six-month score history",
        "Earlier document reminders",
        "Contest notes and evidence organisation",
      ],
    },
    {
      id: "fleet" as PlanId,
      name: "Fleet",
      monthly: 240,
      yearly: 2400,
      blurb: "The same records, read across every driver you actually add.",
      features: [
        "Fleet dashboard",
        "Driver records you create",
        "Compliance and violation totals",
        "Pro intelligence for the owner",
        "Administrative separation from personal driving",
      ],
    },
  ],
};

export function planById(id: PlanId) {
  return pricingConfig.plans.find((p) => p.id === id) ?? pricingConfig.plans[0];
}
