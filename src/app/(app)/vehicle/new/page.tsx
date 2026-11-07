import { VehicleForm } from "@/components/forms";
import { canAddVehicle } from "@/domain/entitlements";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Add a vehicle" };

export default async function Page() {
  const ws = await loadWorkspace();
  const gate = ws.mode === "demo" ? { ok: false, reason: "Demo data cannot gain a vehicle. Create an account." } : canAddVehicle(ws.entitlements.plan, ws.vehicles.length);
  return (
    <div className="mx-auto grid max-w-xl gap-6">
      <header>
        <p className="eyebrow">Garage</p>
        <h1 className="display text-5xl">Add a vehicle</h1>
        <p className="mt-3 text-sm text-muted">You are typing this. It is not a DVLA lookup.</p>
      </header>
      <VehicleForm locked={gate.ok ? undefined : gate.reason} />
    </div>
  );
}
