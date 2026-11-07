import Link from "next/link";
import { notFound } from "next/navigation";
import { TransferForm } from "@/components/forms";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Transfer" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await loadWorkspace();
  const vehicle = ws.vehicles.find((v) => v.id === id);
  if (!vehicle) notFound();
  const transfer = ws.transfers.find((t) => t.vehicleId === id);
  const agreement = ws.documents.some((d) => d.vehicleId === id && d.kind === "sale_agreement");
  return (
    <div className="grid max-w-xl gap-6">
      <header>
        <p className="eyebrow">Transfer</p>
        <h1 className="display text-5xl">{vehicle.plate}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">This checklist organises a sale. It does not submit a DVLA application. The Police have published that outstanding TraffiTech fines can block DVLA transactions — confirm before you go.</p>
      </header>
      <ul className="grid gap-2 text-sm">
        <li>{agreement ? "✓" : "–"} Sale agreement {agreement ? "saved" : "not in the vault"}</li>
        <li>✓ Vehicle information</li>
        <li>{ws.documents.some((d) => d.vehicleId === id) ? "✓" : "–"} Supporting documents</li>
        <li>⚠ Ownership record update · {transfer?.ownershipUpdate?.replaceAll("_", " ") ?? "not started"}</li>
      </ul>
      <Link href="/documents/new" className="text-sm underline">Add the agreement to the vault</Link>
      {ws.mode === "demo" ? <p>Demo checklists are not saved.</p> : <TransferForm vehicleId={id} transfer={transfer} />}
    </div>
  );
}
