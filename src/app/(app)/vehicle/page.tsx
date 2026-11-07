import { VehicleScreen } from "@/components/vehicle-screen";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Vehicle" };

export default async function Page() {
  return <VehicleScreen ws={await loadWorkspace()} />;
}
