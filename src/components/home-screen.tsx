import Link from "next/link";
import { formatDay } from "@/domain/dates";
import { DriverIntelligenceEngine } from "@/domain/intelligence";
import type { Workspace } from "@/domain/types";
import { ScoreRing } from "./score-ring";
import { Source, Status } from "./ui";

export function HomeScreen({ ws }: { ws: Workspace }) {
  const vehicle = ws.activeVehicle;
  const decision = DriverIntelligenceEngine.fromWorkspace(ws);
  const readiness = decision.readiness();
  const coaching = decision.coaching()[0];
  const attention = ws.primaryAttention;
  const urgent = ws.hero.state === "urgent" || ws.hero.state === "attention";
  return (
    <div className="grid gap-10">
      <header className="max-w-xl" data-tour="home">
        <p className="eyebrow">{ws.dayLabel}</p>
        <h1 className="display mt-3 text-[3.1rem] sm:text-6xl">{ws.greeting}</h1>
        <p className="mt-4 flex items-center gap-3 text-lg">
          <Status tone={ws.hero.state === "urgent" ? "bad" : ws.hero.state === "attention" ? "warn" : ws.hero.state === "setup" ? "info" : "good"}>
            {ws.hero.title}
          </Status>
        </p>
      </header>

      {urgent && attention ? (
        <Link href={attention.href} className="card block px-6 py-6 sm:px-8">
          <p className="eyebrow">{attention.severity === "urgent" ? "Urgent" : "Attention"}</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="display max-w-md text-4xl">{attention.title}</h2>
              <p className="mt-3 max-w-md text-muted">{attention.detail}</p>
            </div>
            {attention.type === "FINE_DEADLINE" || attention.type === "NEW_VIOLATION" ? (
              <p className="numeric text-6xl">{ws.totals.outstandingGhs ? `₵${Math.round(ws.totals.outstandingGhs)}` : ""}</p>
            ) : null}
          </div>
          <p className="mt-6 text-sm">{attention.recommendedAction}</p>
        </Link>
      ) : null}

      <section className="grid items-center gap-8 lg:grid-cols-[auto_1fr]" data-tour="score">
        <ScoreRing
          value={ws.score.overall}
          label={ws.score.overall == null ? "No driver score yet" : `Driver score ${ws.score.overall}, ${ws.score.band}`}
        />
        <div>
          <p className="eyebrow">Driver status</p>
          <p className="display mt-2 text-4xl">{ws.score.band ?? "Not enough data"}</p>
          {ws.score.components ? (
            <dl className="mt-5 grid max-w-md grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <ScoreLine label="Speed compliance" value={ws.score.components.speed} />
              <ScoreLine label="Smooth braking" value={ws.score.components.braking} />
              <ScoreLine label="Acceleration" value={ws.score.components.acceleration} />
              <ScoreLine label="Traffic compliance" value={ws.score.components.traffic} />
              <ScoreLine label="Consistency" value={ws.score.components.consistency} />
            </dl>
          ) : (
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{ws.score.note}</p>
          )}
          <div className="mt-4">
            <Source source={ws.score.source} />
          </div>
        </div>
      </section>

      {vehicle ? (
        <section className="grid gap-6 border-t border-line pt-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="eyebrow">Vehicle</p>
            <p className="numeric mt-3 text-5xl tracking-normal">{vehicle.plate}</p>
            <p className="mt-2 text-lg">{vehicle.name}{vehicle.year ? ` · ${vehicle.year}` : ""}</p>
            <p className="mt-6 eyebrow">Compliance</p>
            <p className="numeric mt-2 text-5xl">{vehicle.compliance == null ? "—" : `${vehicle.compliance}%`}</p>
            <p className="mt-2 text-sm text-muted">{vehicle.standingLabel}</p>
          </div>
          <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-line bg-line">
            {ws.statuses.map((status) => (
              <li key={status.id} className="bg-raised px-4 py-5">
                <p className="text-sm text-muted">{status.label}</p>
                <div className="mt-3">
                  <Status tone={status.tone}>{status.value}</Status>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="card px-6 py-8">
          <p className="eyebrow">Vehicle</p>
          <h2 className="display mt-3 text-4xl">The garage is empty.</h2>
          <p className="mt-3 max-w-md text-muted">Add the car you drive. Dates you enter stay marked as yours — Nokware does not check DVLA.</p>
          <Link href="/vehicle/new" className="btn mt-6">Add a vehicle</Link>
        </section>
      )}

      {attention && !urgent ? (
        <section className="border-l-2 border-bronze pl-5">
          <p className="eyebrow">Next thing you need to know</p>
          <h2 className="display mt-3 max-w-lg text-4xl">{attention.title}</h2>
          <p className="mt-3 max-w-lg text-muted">{attention.detail}</p>
          <Link href={attention.href} className="mt-5 inline-flex min-h-11 items-center text-sm underline underline-offset-4">
            View details
          </Link>
        </section>
      ) : null}

      <section className="max-w-lg border-t border-line pt-8">
        <p className="eyebrow">What you should know</p>
        <p className="mt-3 text-lg">{readiness.state}. {readiness.title}</p>
        <p className="mt-2 text-sm text-muted">{coaching}</p>
        <p className="mt-3"><Source source={readiness.source} /></p>
      </section>

      {ws.insights[0] ? (
        <p className="max-w-lg text-[15px] leading-relaxed">
          {ws.insights[0].text}{" "}
          <Link href="/score" className="underline underline-offset-4">See the score</Link>
        </p>
      ) : null}

      <p className="text-xs text-faint">Updated {formatDay(ws.generatedAt.slice(0, 10))} · {new Date(ws.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" })} Accra</p>
    </div>
  );
}

function ScoreLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/80 pb-2">
      <dt className="text-muted">{label}</dt>
      <dd className="numeric text-2xl tracking-normal">{value}</dd>
    </div>
  );
}
