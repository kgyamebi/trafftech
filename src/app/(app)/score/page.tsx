import { ScoreScreen } from "@/components/score-screen";
import type { ScoreWindow } from "@/domain/types";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Driver score" };

export default async function Page({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const { window } = await searchParams;
  const chosen: ScoreWindow = window === "today" || window === "week" || window === "6months" ? window : "month";
  return <ScoreScreen ws={await loadWorkspace()} window={chosen} />;
}
