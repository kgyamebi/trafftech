import { PlanScreen } from "@/components/rest-screens";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Plan" };

export default async function Page() {
  return <PlanScreen ws={await loadWorkspace()} />;
}
