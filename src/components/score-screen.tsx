import Link from "next/link";
import { scoreFactorRows } from "@/domain/intelligence";
import type { ScoreWindow, Workspace } from "@/domain/types";
import { ScoreRing } from "./score-ring";
import { EmptyState, Source } from "./ui";

const WINDOWS: { id: ScoreWindow; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "6months", label: "6 months" },
];

export function ScoreScreen({ ws, window }: { ws: Workspace; window: ScoreWindow }) {
  const locked = window === "6months" && !ws.entitlements.historicalAnalytics;
  const score = locked ? ws.scores.month : ws.scores[window];
  return (
    <div className="grid gap-10">
      <header>
        <p className="eyebrow">Driver score</p>
        <h1 className="display mt-3 text-5xl">{score.band ?? "Not enough driving data yet."}</h1>
      </header>
      <div className="flex flex-wrap gap-2">
        {WINDOWS.map((item) => (
          <Link key={item.id} href={`/score?window=${item.id}`} className={window === item.id ? "btn" : "btn btn-ghost"}>
            {item.label}
          </Link>
        ))}
      </div>
      <p className="max-w-prose text-sm text-muted">Daily, weekly and monthly windows are above. A yearly score is not shown, because this account does not have a year of saved drives. Cornering, road risk and driver improvement are not recorded, so they are not part of the score. The <Link href="/protect" className="underline">protection check</Link> is a different number.</p>
      {locked ? (
        <p className="max-w-lg text-sm text-muted">Six-month history is part of Pro. The month above is still yours. Requesting Pro does not charge you.</p>
      ) : null}
      {score.status !== "ready" || score.components == null || score.overall == null ? (
        <div className="grid gap-4">
          <EmptyState title="Not enough driving data yet." body={score.note} action={<Link className="btn" href="/drive">Record a drive</Link>} />
          <p className="max-w-prose text-sm text-muted">Attention events and driving efficiency are not recorded, so they are not part of the score.</p>
        </div>
      ) : (
        <div className="grid items-center gap-8 lg:grid-cols-[auto_1fr]">
          <ScoreRing value={score.overall} label={`Score ${score.overall}`} />
          <ul className="grid gap-3">
            {scoreFactorRows(score).map((factor) => (
              <li key={factor.label}>
                <div className="mb-1 flex justify-between gap-4 text-sm">
                  <span>{factor.label}</span>
                  <span className="numeric text-xl">{factor.value == null ? "Not recorded" : factor.value}</span>
                </div>
                {factor.value == null ? null : (
                  <div className="h-px bg-line">
                    <div className="h-px bg-ink" style={{ width: `${factor.value}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <section>
        <h2 className="display text-3xl">Am I improving?</h2>
        <Trend ws={ws} />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="eyebrow">Insights</h2>
          <ul className="mt-3 grid gap-3">
            {ws.insights.length ? ws.insights.map((insight) => <li key={insight.id} className="text-[15px] leading-relaxed">{insight.text}</li>) : <li className="text-muted">Insights appear when two saved drives can be compared.</li>}
          </ul>
        </div>
        <div>
          <h2 className="eyebrow">Achievements</h2>
          <ul className="mt-3 grid gap-3">
            {ws.achievements.map((item) => (
              <li key={item.id} className="text-sm">
                <span className={item.earned ? "text-good" : "text-faint"}>{item.earned ? "Earned" : "Not yet"}</span>
                <span className="mt-1 block text-base text-ink">{item.title}</span>
                <span className="text-muted">{item.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <p className="max-w-prose text-sm leading-relaxed text-muted">{score.note} Each harsh brake in the period deducts 3 points. Each harsh acceleration deducts 5.5, then the component is rounded. Speed compliance is the share of samples at or under the limit you selected, plus 1 km/h for instrument noise. A violation saved in the period deducts 15 from traffic compliance. Nothing here rewards going faster.</p>
      <Source source={score.source} />
    </div>
  );
}

function Trend({ ws }: { ws: Workspace }) {
  const points = (["week", "month", "6months"] as const).map((id) => ({
    id,
    value: ws.entitlements.historicalAnalytics || id !== "6months" ? ws.scores[id].overall : null,
  }));
  const ready = points.filter((p) => p.value != null) as { id: string; value: number }[];
  if (ready.length < 2) return <p className="mt-3 text-sm text-muted">A trend needs more than one window with enough driving.</p>;
  const w = 320;
  const h = 120;
  const min = Math.min(...ready.map((p) => p.value)) - 5;
  const max = Math.max(...ready.map((p) => p.value)) + 5;
  const d = ready
    .map((p, i) => {
      const x = (i / (ready.length - 1)) * (w - 20) + 10;
      const y = h - 16 - ((p.value - min) / (max - min)) * (h - 32);
      return `${i === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full max-w-lg" role="img" aria-label="Score across windows">
      <path d={d} fill="none" stroke="#161712" strokeWidth="1.5" />
      {ready.map((p, i) => {
        const x = (i / (ready.length - 1)) * (w - 20) + 10;
        const y = h - 16 - ((p.value - min) / (max - min)) * (h - 32);
        return <circle key={p.id} cx={x} cy={y} r="3" fill="#161712" />;
      })}
    </svg>
  );
}
