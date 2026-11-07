import Link from "next/link";
import { ghs } from "@/domain/dates";
import { DriverProtectionEngine } from "@/domain/protection";
import type { Workspace } from "@/domain/types";

export function ProtectionScreen({ ws }: { ws: Workspace }) {
  const components = ws.score.status === "ready" ? ws.score.components : null;
  const engine = new DriverProtectionEngine({
    speedCompliance: components?.speed ?? null,
    braking: components?.braking ?? null,
    acceleration: components?.acceleration ?? null,
    documentCompliance: ws.activeVehicle?.compliance ?? null,
    vehicleStanding: ws.activeVehicle?.standing ?? null,
    activeViolations: ws.totals.activeViolations,
    overdueViolations: ws.violations.filter((item) => item.status === "overdue").length,
    outstandingGhs: ws.totals.outstandingGhs,
    expiredRequired: ws.documents.filter((doc) => doc.status === "expired" && ["insurance", "roadworthiness", "registration", "licence"].includes(doc.kind)).length,
    focusTitle: ws.attention[0]?.title ?? null,
  });
  const score = engine.score();
  const savings = engine.savings();
  const ahead = ws.attention.slice(0, 3);
  return (
    <div className="grid max-w-xl gap-10">
      <header>
        <p className="eyebrow">Know before you owe</p>
        <h1 className="display mt-3 text-5xl">{ahead[0]?.title ?? "Nothing saved needs you right now."}</h1>
        <p className="mt-3 text-muted">The one thing already on this account. Nokware does not predict a fine.</p>
        {ws.mode === "demo" ? <p className="mt-2 text-sm">DEMO. Not your records.</p> : null}
      </header>
      {ahead.length ? (
        <ul className="divide-y divide-line border-y border-line">
          {ahead.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="flex min-h-14 items-center">{item.title}</Link>
            </li>
          ))}
        </ul>
      ) : null}
      <section>
        <p className="eyebrow">Separate from your driver score</p>
        <p className="mt-3 text-2xl">
          {ws.score.overall == null ? "No driver score yet." : `Driver score ${ws.score.overall}.`}
          {score.value == null ? " The protection check needs more saved records." : ` Protection check ${score.value}, ${score.band}.`}
        </p>
        <p className="mt-3 text-sm text-muted">{score.note}</p>
        <ul className="mt-4 grid gap-2 text-sm">
          {score.factors.map((factor) => (
            <li key={factor.label} className="flex justify-between gap-4">
              <span>{factor.label}</span>
              <span>{factor.value == null ? "Not recorded" : factor.value}</span>
            </li>
          ))}
        </ul>
        <Link href="/score" className="mt-4 inline-flex min-h-11 items-center underline">See the driver score</Link>
      </section>
      <section>
        <h2 className="display text-3xl">This month</h2>
        <ul className="mt-4 grid gap-2 text-lg">
          {savings.lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <p className="mt-6 text-sm text-muted">Open notice amount</p>
        <p className="numeric mt-1 text-5xl">{savings.amountGhs == null ? "None saved" : ghs(savings.amountGhs)}</p>
        <p className="mt-2 text-sm text-muted">{savings.amountNote}</p>
      </section>
      <section>
        <h2 className="display text-3xl">Road awareness</h2>
        <p className="mt-3 text-muted">{engine.roadNote()}</p>
      </section>
      <Link href="/now" className="btn w-fit">Driving screen</Link>
    </div>
  );
}
