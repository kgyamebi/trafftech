import { TrafficScreen } from "@/components/traffic-screen";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Traffic" };

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const chosen = ["history", "payments", "evidence"].includes(tab ?? "") ? (tab as string) : "active";
  return <TrafficScreen ws={await loadWorkspace()} tab={chosen} />;
}
