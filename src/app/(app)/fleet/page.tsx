import { FleetScreen } from "@/components/rest-screens";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Fleet" };

export default async function Page() {
  return <FleetScreen ws={await loadWorkspace()} />;
}
