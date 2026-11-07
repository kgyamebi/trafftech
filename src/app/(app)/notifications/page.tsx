import { NotificationsScreen } from "@/components/rest-screens";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Notifications" };

export default async function Page({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const chosen = ["traffic", "vehicle", "safety", "system"].includes(topic ?? "") ? (topic as string) : "everything";
  return <NotificationsScreen ws={await loadWorkspace()} topic={chosen} />;
}
