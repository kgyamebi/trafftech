import { ScoreScreen } from "@/components/score-screen";
import type { ScoreWindow } from "@/domain/types";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Driver record" };

export default async function Page({ searchParams }: { searchParams: Promise<{ window?: string; drive?: string }> }) {
  const { window, drive } = await searchParams;
  const chosen: ScoreWindow = window === "today" || window === "week" || window === "6months" ? window : "month";
  return <ScoreScreen ws={await loadWorkspace()} window={chosen} driveId={drive ?? null} />;
}
