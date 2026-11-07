import { AnalyticsScreen } from "@/components/rest-screens";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Analytics" };

export default async function Page() {
  return <AnalyticsScreen ws={await loadWorkspace()} />;
}
