import { ContestForm } from "@/components/forms";
import { OFFICIAL_FINE_CHANNELS } from "@/domain/fines";
import { loadWorkspace } from "@/server/workspace";
import { notFound } from "next/navigation";

export const metadata = { title: "Contest notes" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await loadWorkspace();
  const violation = ws.violations.find((v) => v.id === id);
  if (!violation) notFound();
  const prior = ws.contests.filter((c) => c.violationId === id);
  return (
    <div className="grid max-w-xl gap-6">
      <header>
        <p className="eyebrow">Contest</p>
        <h1 className="display text-5xl">Organise the case. Don’t file it here.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Public Police guidance says a TraffiTech contest starts on the official portal within 14 days, after you view the evidence, and cannot be started at the station. Nokware will not say you will win. Portal: {OFFICIAL_FINE_CHANNELS.portal}
        </p>
      </header>
      <ContestForm violationId={id} />
      {prior.map((c) => (
        <p key={c.id} className="text-sm text-muted">Notes saved {c.createdAt.slice(0, 10)}. Status: preparing. Nothing was submitted.</p>
      ))}
    </div>
  );
}
