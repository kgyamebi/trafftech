import { EmergencyScreen } from "@/components/emergency-screen";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Emergency" };

export default async function Page() {
  return <EmergencyScreen ws={await loadWorkspace()} />;
}
