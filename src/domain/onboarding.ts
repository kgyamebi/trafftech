export const ONBOARDING_STEPS = [
  { id: "welcome", title: "Welcome", kicker: "Nokware" },
  { id: "status", title: "Know your status", kicker: "Home" },
  { id: "drive", title: "Drive with confidence", kicker: "Drive" },
  { id: "vehicle", title: "Know your vehicle", kicker: "Vehicle" },
  { id: "traffic", title: "Never miss a traffic event", kicker: "Traffic" },
  { id: "score", title: "Understand your driving", kicker: "Score" },
  { id: "ai", title: "Your copilot", kicker: "Intelligence" },
  { id: "ready", title: "You're ready", kicker: "Begin" },
] as const;

export function onboardingComplete(input: { skipped: boolean; stepIndex: number }): boolean {
  if (input.skipped) return true;
  return input.stepIndex >= ONBOARDING_STEPS.length - 1;
}

export const TOUR_STEPS = [
  { href: "/home", title: "Map", body: "The map opens first. Status sits on it, one message at a time." },
  { href: "/drive", title: "Drive", body: "Your speed, the limit you selected, and the next change." },
  { href: "/vehicle", title: "Vehicle", body: "A garage for documents, not a form from an office." },
  { href: "/traffic", title: "Traffic", body: "Notices you import, deadlines you confirm, evidence you actually have." },
  { href: "/score", title: "Driver score", body: "A calculation from your driving. Never a guess, never a prize for speed." },
  { href: "/ask", title: "Intelligence", body: "Questions answered from your records, with the reasoning labelled." },
  { href: "/fleet", title: "Fleet", body: "The same standard, across drivers you add yourself." },
] as const;
