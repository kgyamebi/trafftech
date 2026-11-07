import type { Achievement, DrivingSessionRecord, Insight, ScoreView, ViolationRecord } from "./types";
import { speedCompliance } from "./score";

export function buildInsights(input: {
  score: ScoreView;
  sessions: DrivingSessionRecord[];
  driverId?: string | null;
}): Insight[] {
  if (input.score.status !== "ready" || !input.score.components) return [];
  const mine = input.sessions
    .filter((s) => (s.driverId ?? null) === (input.driverId ?? null) && !s.simulated)
    .sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  const insights: Insight[] = [];
  const c = input.score.components;
  const source = input.score.source === "DEMO" ? "DEMO" : "CALCULATED";

  const rows: [string, number][] = [
    ["speed compliance", c.speed],
    ["smooth braking", c.braking],
    ["acceleration", c.acceleration],
    ["traffic compliance", c.traffic],
    ["consistency", c.consistency],
  ];
  const weakest = rows.sort((a, b) => a[1] - b[1])[0];

  if (weakest[1] < 95) {
    insights.push({
      id: "weakest",
      source,
      text: `The lowest part of the month is ${weakest[0]} at ${weakest[1]}.`,
    });
  }

  if (mine.length >= 2) {
    const prev = mine[mine.length - 2];
    const last = mine[mine.length - 1];
    const prevC = speedCompliance(prev.samples);
    const lastC = speedCompliance(last.samples);
    if (prevC != null && lastC != null && lastC - prevC >= 8) {
      insights.push({
        id: "speed-up",
        source,
        text: `Speed compliance rose from ${prevC} to ${lastC} between your last two saved drives.`,
      });
    } else if (prevC != null && lastC != null && prevC - lastC >= 8) {
      insights.push({
        id: "speed-down",
        source,
        text: `Speed compliance fell from ${prevC} to ${lastC} on your latest saved drive.`,
      });
    }
    if (prev.harshBrakes > 0 && last.harshBrakes < prev.harshBrakes) {
      const drop = Math.round((1 - last.harshBrakes / prev.harshBrakes) * 100);
      if (drop >= 20) {
        insights.push({
          id: "brake-drop",
          source,
          text: `Harsh braking events decreased ${drop}% from the drive before.`,
        });
      }
    }
  }

  if (c.speed >= 95 && c.consistency >= 90) {
    insights.push({
      id: "steady-speed",
      source,
      text: "Speed stayed close to the limit you selected, without sitting over it.",
    });
  }

  return insights.slice(0, 3);
}

export function buildAchievements(input: {
  month: ScoreView;
  violations: ViolationRecord[];
  readyToDrive: boolean;
  cleanWindow: boolean;
}): Achievement[] {
  return [
    {
      id: "steady",
      title: "Steady month",
      detail: "A strong month, from saved driving.",
      earned: input.month.status === "ready" && (input.month.overall ?? 0) >= 90,
    },
    {
      id: "clear",
      title: "Clear record",
      detail: "No violation saved in the last six months.",
      earned: input.cleanWindow,
    },
    {
      id: "ready",
      title: "Ready to drive",
      detail: "No expired or expiring insurance, roadworthiness, or registration, and no open fine in what you have saved.",
      earned: input.readyToDrive,
    },
  ];
}

export function explainScoreChange(current: ScoreView, previous: ScoreView | null): string {
  if (current.status !== "ready" || current.overall == null || !current.components) {
    return current.note;
  }
  if (!previous || previous.status !== "ready" || previous.overall == null || !previous.components) {
    const c = current.components;
    return `The score is ${current.overall}. Speed compliance is ${c.speed}. Smooth braking is ${c.braking}. Acceleration is ${c.acceleration}. Traffic compliance is ${c.traffic}. Consistency is ${c.consistency}.`;
  }
  const delta = current.overall - previous.overall;
  if (delta === 0) return `The score is unchanged at ${current.overall}.`;
  const names = [
    ["speed compliance", current.components.speed - previous.components.speed],
    ["smooth braking", current.components.braking - previous.components.braking],
    ["acceleration", current.components.acceleration - previous.components.acceleration],
    ["traffic compliance", current.components.traffic - previous.components.traffic],
    ["consistency", current.components.consistency - previous.components.consistency],
  ] as const;
  const mover = [...names].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  const direction = delta > 0 ? "increased" : "decreased";
  const moverText =
    mover[1] === 0
      ? "No single component moved on its own."
      : `The largest move was ${mover[0]}, ${mover[1] > 0 ? "up" : "down"} ${Math.abs(mover[1])} points.`;
  return `Your score ${direction} from ${previous.overall} to ${current.overall}. ${moverText}`;
}
