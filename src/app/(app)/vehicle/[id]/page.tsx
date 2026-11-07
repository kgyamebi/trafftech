import { notFound } from "next/navigation";
import { VehicleScreen } from "@/components/vehicle-screen";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Vehicle" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await loadWorkspace();
  if (!ws.vehicles.some((v) => v.id === id)) notFound();
  return <VehicleScreen ws={ws} focusId={id} />;
}
