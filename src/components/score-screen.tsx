import Link from "next/link";
import { docStatusLabel, statusTone } from "@/domain/compliance";
import { formatDay, formatWhen, ghs, inWindow, windowStart } from "@/domain/dates";
import { scoreFactorRows } from "@/domain/intelligence";
import { formatDistance } from "@/domain/navigation";
import type { ScoreComponents, ScoreWindow, SessionView, ViolationView, Workspace } from "@/domain/types";
import { ScoreRing } from "./score-ring";
import { EmptyState, Source, Status } from "./ui";

const WINDOWS: { id: ScoreWindow; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "6months", label: "6 months" },
];

const TREND: { id: ScoreWindow; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "6months", label: "6 months" },
];

const PAPER_RANK: Record<string, number> = { expired: 0, expiring: 1, missing: 2, unknown: 3, valid: 4 };

export function ScoreScreen({ ws, window, driveId = null }: { ws: Workspace; window: ScoreWindow; driveId?: string | null }) {
  const locked = window === "6months" && !ws.entitlements.historicalAnalytics;
  const shown: ScoreWindow = locked ? "month" : window;
  const score = ws.scores[shown];
  const ready = score.status === "ready" && score.components != null && score.overall != null;
  const now = new Date(ws.generatedAt);
  const start = windowStart(now, shown);
  const papers = [...ws.documents].sort((a, b) => (PAPER_RANK[a.status] ?? 9) - (PAPER_RANK[b.status] ?? 9) || (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999));
  const nextPaper = papers.find((doc) => doc.status === "expired" || doc.status === "expiring" || doc.status === "missing") ?? papers[0] ?? null;
  const factors = scoreFactorRows(score);
  const measured = factors.filter((factor) => factor.value != null);
  const opened = driveId ? ws.sessions.find((drive) => drive.id === driveId && !drive.simulated) ?? null : null;
  const happened = storyIn(ws, shown);
  return (
    <div className="grid gap-12">
      {ws.primaryAttention ? (
        <Link href={ws.primaryAttention.href} className="card block px-5 py-5 sm:px-7">
          <p className="eyebrow">{ws.primaryAttention.severity === "urgent" ? "Urgent" : "Next"}</p>
          <p className="mt-2 text-3xl">{ws.primaryAttention.title}</p>
          <p className="mt-2 max-w-xl text-sm text-muted">{ws.primaryAttention.detail}</p>
          <p className="mt-3 text-sm">{ws.primaryAttention.recommendedAction}</p>
          <p className="mt-3"><Source source={ws.primaryAttention.source} /></p>
        </Link>
      ) : null}
      <header className="grid items-end gap-8 border-b border-line pb-8 lg:grid-cols-[1fr_auto]">
        <div>
          <p className="eyebrow">Driver record</p>
          <h1 className="display mt-3 text-6xl sm:text-7xl">{score.band ?? "Not enough driving data yet."}</h1>
          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
            <div>
              <dt className="eyebrow">Drives</dt>
              <dd className="numeric mt-2 text-4xl">{score.sessionsInWindow}</dd>
            </div>
            <div>
              <dt className="eyebrow">Minutes</dt>
              <dd className="numeric mt-2 text-4xl">{score.minutes}</dd>
            </div>
            {ws.activeVehicle ? (
              <div>
                <dt className="eyebrow">Vehicle</dt>
                <dd className="mt-2 text-lg">{ws.activeVehicle.plate}</dd>
                <dd className="mt-1 text-sm text-muted">{ws.activeVehicle.standingLabel}{ws.activeVehicle.compliance == null ? "" : ` · ${ws.activeVehicle.compliance}%`}</dd>
              </div>
            ) : null}
          </dl>
          {ws.mode === "demo" ? <p className="mt-5 max-w-md text-sm text-muted">This is the demonstration record. It is not yours.</p> : null}
          <div className="mt-6 inline-flex flex-wrap rounded-full border border-line bg-raised p-1" aria-label="Record window">
            {WINDOWS.map((item) => (
              <Link
                key={item.id}
                href={`/score?window=${item.id}`}
                className={window === item.id ? "rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper" : "rounded-full px-4 py-2 text-sm font-semibold text-muted"}
                aria-current={window === item.id ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        {ready ? <ScoreRing value={score.overall} label={`Score ${score.overall}`} size={196} /> : null}
      </header>

      <p className="max-w-prose text-sm text-muted">Daily, weekly and monthly windows are above. A yearly score is not shown, because this account does not have a year of saved drives. Cornering, road risk and driver improvement are not recorded, so they are not part of the score. The <Link href="/protect" className="underline">protection check</Link> is a different number.</p>
      {locked ? (
        <p className="max-w-lg text-sm text-muted">Six-month history is part of Pro. The month above is still yours. Requesting Pro does not charge you.</p>
      ) : null}

      {ready ? (
        <section>
          <h2 className="display text-3xl">What was recorded</h2>
          <ul className="mt-5 grid gap-4">
            {measured.map((factor) => (
              <li key={factor.label} className="grid grid-cols-[1fr_auto] items-end gap-4">
                <div>
                  <p className="text-sm">{factor.label}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-ink" style={{ width: `${factor.value}%` }} />
                  </div>
                </div>
                <p className="numeric text-3xl">{factor.value}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 max-w-prose text-sm text-muted">Attention events and driving efficiency are not recorded, so they are not part of the score.</p>
        </section>
      ) : (
        <div className="grid gap-4">
          <EmptyState title="Not enough driving data yet." body={score.note} action={<Link className="btn" href="/drive">Record a drive</Link>} />
          <p className="max-w-prose text-sm text-muted">A blank score is not a zero. A short record stays unscored. Attention events and driving efficiency are not recorded, so they are not part of the score.</p>
        </div>
      )}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="display text-4xl">What happened</h2>
          <p className="text-sm text-muted">{WINDOWS.find((item) => item.id === shown)?.label}</p>
        </div>
        {opened ? <DriveDetail ws={ws} drive={opened} window={window} /> : null}
        {happened.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nothing was saved in this window. Practice routes are not saved.</p>
        ) : (
          <ol className="mt-5 grid gap-3">
            {happened.map((item) => item.kind === "drive" ? (
              <DriveRow key={item.drive.id} drive={item.drive} earlier={driveBefore(ws, item.drive)} window={window} open={opened?.id === item.drive.id} />
            ) : (
              <NoticeRow key={item.notice.id} notice={item.notice} paymentNote={paymentLine(ws, item.notice.id)} />
            ))}
          </ol>
        )}
        <p className="mt-4 max-w-prose text-sm text-muted">Saved speeds come from this phone. It is not a certified speedometer.</p>
      </section>

      <section className="card overflow-hidden px-5 py-6 sm:px-7">
        <h2 className="display text-4xl">Am I improving?</h2>
        <Compare ws={ws} window={shown} />
        <Trend ws={ws} />
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="display text-4xl">Papers you dated</h2>
            <p className="mt-2 max-w-md text-sm text-muted">These dates are not part of the score. Nokware does not check DVLA.</p>
          </div>
          <Link href="/documents" className="text-sm underline underline-offset-4">Open documents</Link>
        </div>
        {nextPaper && !ws.primaryAttention ? (
          <p className="mt-5 text-lg">
            {nextPaper.label} · {docStatusLabel(nextPaper.status)}
            {nextPaper.daysRemaining == null ? "" : ` · ${nextPaper.daysRemaining} days`}
          </p>
        ) : null}
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {papers.length === 0 ? <li className="text-sm text-muted">No paper saved.</li> : null}
          {papers.map((doc) => (
            <li key={doc.id} className="card px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-lg">{doc.label}</p>
                <Status tone={statusTone(doc.status)}>{docStatusLabel(doc.status)}</Status>
              </div>
              <p className="numeric mt-4 text-5xl">{doc.daysRemaining == null ? "—" : doc.daysRemaining}</p>
              <p className="mt-2 text-sm text-muted">{doc.expiresOn ? formatDay(doc.expiresOn) : "No date"} · {doc.verificationLabel}</p>
              <p className="mt-3"><Source source={doc.source} /></p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="display text-4xl">Notices you saved</h2>
        <p className="mt-2 max-w-prose text-sm text-muted">A notice is in the score only when its date sits inside this window. It is not an official record.</p>
        <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-4">
          <div>
            <dt className="eyebrow">Open</dt>
            <dd className="numeric mt-2 text-4xl">{ws.totals.activeViolations}</dd>
          </div>
          <div>
            <dt className="eyebrow">Outstanding</dt>
            <dd className="numeric mt-2 text-4xl">{ghs(ws.totals.outstandingGhs)}</dd>
          </div>
          <div>
            <dt className="eyebrow">Paid this year</dt>
            <dd className="numeric mt-2 text-4xl">{ghs(ws.totals.paidThisYearGhs)}</dd>
          </div>
        </dl>
        <ul className="mt-5 grid gap-3">
          {ws.violations.length === 0 ? <li className="text-sm text-muted">No notice saved.</li> : null}
          {ws.violations.map((notice) => {
            const payment = ws.payments.find((row) => row.violationId === notice.id) ?? null;
            const inside = inWindow(notice.occurredAt, start, now);
            return (
              <li key={notice.id} className="card px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow">{inside ? "Inside this window" : "Outside this window"}</p>
                    <h3 className="mt-2 text-2xl"><Link href={`/traffic/${notice.id}`} className="underline underline-offset-4">{notice.title}</Link></h3>
                    <p className="mt-2 text-sm text-muted">{formatWhen(notice.occurredAt)}{notice.locationLabel ? ` · ${notice.locationLabel}` : ""}</p>
                  </div>
                  <p className="numeric text-5xl">{ghs(notice.amountGhs)}</p>
                </div>
                <div className="mt-4">
                  <Status tone={notice.status === "paid_user_reported" || notice.status === "closed" ? "good" : notice.status === "overdue" || notice.status === "action_required" ? "bad" : "warn"}>
                    {notice.status === "paid_user_reported" ? "Recorded as paid" : notice.status.replaceAll("_", " ")}
                  </Status>
                </div>
                {payment ? <p className="mt-3 text-sm text-muted">{formatDay(payment.paidOn)} · {payment.reference}{payment.note ? ` · ${payment.note}` : ""}</p> : null}
                <p className="mt-3"><Source source={notice.source} /></p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="display text-3xl">Insights</h2>
          <ul className="mt-4 grid gap-3">
            {ws.insights.length === 0 ? <li className="text-sm text-muted">Insights appear when two saved drives can be compared.</li> : null}
            {ws.insights.map((insight) => (
              <li key={insight.id} className="card px-5 py-5">
                <p className="text-lg leading-snug">{insight.text}</p>
                <p className="mt-3"><Source source={insight.source} /></p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="display text-3xl">Achievements</h2>
          <ul className="mt-4 grid gap-3">
            {ws.achievements.map((item) => (
              <li key={item.id} className={item.earned ? "card px-5 py-5" : "rounded-[16px] border border-dashed border-line px-5 py-5"}>
                <p className={item.earned ? "text-sm font-semibold text-good" : "text-sm font-semibold text-faint"}>{item.earned ? "Earned" : "Not yet"}</p>
                <p className="mt-2 text-2xl">{item.title}</p>
                <p className="mt-2 text-sm text-muted">{item.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="grid gap-4 border-t border-line pt-8">
        <p className="max-w-prose text-sm leading-relaxed text-muted">{score.note} Calculated from saved driving. Nothing here rewards going faster.</p>
        <div className="flex flex-wrap items-center gap-4">
          <Source source={score.source} />
          {ws.mode === "user" ? <a className="btn" href="/api/export">Export a copy</a> : <p className="text-sm text-muted">The demonstration cannot be exported as yours.</p>}
        </div>
      </footer>
    </div>
  );
}

function recordHref(window: ScoreWindow, driveId?: string | null): string {
  const query = new URLSearchParams();
  if (window !== "month") query.set("window", window);
  if (driveId) query.set("drive", driveId);
  const text = query.toString();
  return text ? `/score?${text}` : "/score";
}

function paymentLine(ws: Workspace, violationId: string): string | null {
  const payment = ws.payments.find((row) => row.violationId === violationId);
  if (!payment) return null;
  return `${formatDay(payment.paidOn)} · ${payment.reference}${payment.note ? ` · ${payment.note}` : ""}`;
}

function storyIn(ws: Workspace, window: ScoreWindow): ({ kind: "drive"; drive: SessionView; at: string } | { kind: "notice"; notice: ViolationView; at: string })[] {
  const now = new Date(ws.generatedAt);
  const start = windowStart(now, window);
  const drives = drivesIn(ws, window).map((drive) => ({ kind: "drive" as const, drive, at: drive.endedAt }));
  const notices = ws.violations
    .filter((notice) => inWindow(notice.occurredAt, start, now))
    .map((notice) => ({ kind: "notice" as const, notice, at: notice.occurredAt }));
  return [...drives, ...notices].sort((a, b) => b.at.localeCompare(a.at));
}

function drivesIn(ws: Workspace, window: ScoreWindow): SessionView[] {
  const now = new Date(ws.generatedAt);
  const start = windowStart(now, window);
  return ws.sessions
    .filter((drive) => !drive.simulated && inWindow(drive.endedAt, start, now))
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

function driveBefore(ws: Workspace, drive: SessionView): SessionView | null {
  const ordered = ws.sessions.filter((row) => !row.simulated).sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  const index = ordered.findIndex((row) => row.id === drive.id);
  return index > 0 ? ordered[index - 1] : null;
}

function DriveDetail({ ws, drive, window }: { ws: Workspace; drive: SessionView; window: ScoreWindow }) {
  const vehicle = ws.vehicles.find((item) => item.id === drive.vehicleId) ?? null;
  const earlier = driveBefore(ws, drive);
  return (
    <article className="mt-5 border-l-2 border-ink pl-5">
      <p className="eyebrow">This drive</p>
      <h3 className="mt-2 text-3xl">{drive.originLabel ?? drive.roadContext} → {drive.destinationLabel ?? "Recorded drive"}</h3>
      <p className="mt-2 text-sm text-muted">{formatWhen(drive.startedAt)} to {formatWhen(drive.endedAt)}</p>
      {vehicle ? <p className="mt-2 text-sm">{vehicle.name} · {vehicle.plate}</p> : null}
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Time" value={`${drive.minutes} min`} />
        <Stat label="Distance" value={drive.distanceM == null ? "Not saved" : formatDistance(drive.distanceM)} />
        <Stat label="Mean speed" value={drive.meanSpeed == null ? "—" : `${drive.meanSpeed} km/h`} />
        <Stat label="Speed" value={drive.speedCompliance == null ? "—" : String(drive.speedCompliance)} />
        <Stat label="Harsh brakes" value={String(drive.harshBrakes)} />
        <Stat label="Rapid accelerations" value={String(drive.harshAccelerations)} />
        <Stat label="Speed readings" value={String(drive.samples)} />
      </dl>
      <p className="mt-4 text-sm">{drive.roadContext}</p>
      {earlier?.speedCompliance != null && drive.speedCompliance != null ? <p className="mt-2 text-sm text-muted">Speed compliance was {earlier.speedCompliance} on the drive before this.</p> : null}
      {drive.notes.map((note) => <p key={note} className="mt-2 text-sm text-muted">{note}</p>)}
      <p className="mt-3"><Source source={drive.source} /></p>
      <Link href={recordHref(window)} className="mt-4 inline-flex text-sm underline">Close</Link>
    </article>
  );
}

function NoticeRow({ notice, paymentNote }: { notice: ViolationView; paymentNote: string | null }) {
  return (
    <li className="card grid gap-3 px-5 py-5 sm:grid-cols-[4.5rem_1fr_auto] sm:items-center">
      <div>
        <p className="numeric text-4xl">{new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "Africa/Accra" }).format(new Date(notice.occurredAt))}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">{new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Africa/Accra" }).format(new Date(notice.occurredAt))}</p>
      </div>
      <div>
        <p className="eyebrow">Notice</p>
        <p className="mt-1 text-xl"><Link href={`/traffic/${notice.id}`} className="underline underline-offset-4">{notice.title}</Link></p>
        <p className="mt-1 text-sm text-muted">{formatWhen(notice.occurredAt)}{notice.locationLabel ? ` · ${notice.locationLabel}` : ""}</p>
        {paymentNote ? <p className="mt-2 text-sm text-muted">{paymentNote}</p> : null}
        <p className="mt-2"><Source source={notice.source} /></p>
      </div>
      <p className="numeric text-4xl">{ghs(notice.amountGhs)}</p>
    </li>
  );
}

function Compare({ ws, window }: { ws: Workspace; window: ScoreWindow }) {
  const rows: { label: string; key: "overall" | "drives" | "minutes" | keyof ScoreComponents }[] = [
    { label: "Score", key: "overall" },
    { label: "Speed compliance", key: "speed" },
    { label: "Smooth braking", key: "braking" },
    { label: "Smooth acceleration", key: "acceleration" },
    { label: "Consistency", key: "consistency" },
    { label: "Traffic compliance", key: "traffic" },
    { label: "Drives", key: "drives" },
    { label: "Minutes", key: "minutes" },
  ];
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr>
            <th className="py-2 pr-3 font-medium text-muted">Part</th>
            {TREND.map((item) => (
              <th key={item.id} className={`px-3 py-2 font-medium ${item.id === window ? "bg-sunken text-ink" : "text-muted"}`}>{item.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-line">
              <th className="py-3 pr-3 font-medium">{row.label}</th>
              {TREND.map((item) => (
                <td key={item.id} className={`numeric px-3 py-3 text-2xl tracking-normal ${item.id === window ? "bg-sunken" : ""}`}>{compareCell(ws, item.id, row.key)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function compareCell(ws: Workspace, id: ScoreWindow, key: "overall" | "drives" | "minutes" | keyof ScoreComponents): string {
  if (id === "6months" && !ws.entitlements.historicalAnalytics) return "Pro";
  const score = ws.scores[id];
  if (key === "drives") return String(score.sessionsInWindow);
  if (key === "minutes") return String(score.minutes);
  if (score.status !== "ready" || score.overall == null || score.components == null) return "—";
  if (key === "overall") return String(score.overall);
  return String(score.components[key]);
}

function DriveRow({ drive, earlier, window, open }: { drive: SessionView; earlier: SessionView | null; window: ScoreWindow; open: boolean }) {
  const when = new Date(drive.endedAt);
  const day = Number.isNaN(when.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "Africa/Accra" }).format(when);
  const month = Number.isNaN(when.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Africa/Accra" }).format(when);
  const from = drive.originLabel ?? drive.roadContext;
  const to = drive.destinationLabel ?? "Recorded drive";
  const compared = earlier?.speedCompliance != null && drive.speedCompliance != null
    ? `Speed compliance was ${earlier.speedCompliance} on the drive before this.`
    : null;
  return (
    <li className="card grid gap-4 px-5 py-5 sm:grid-cols-[4.5rem_1fr]">
      <div>
        <p className="numeric text-4xl">{day}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">{month}</p>
      </div>
      <div>
        <p className="text-xl">{from} → {to}</p>
        <p className="mt-1 text-sm text-muted">{formatWhen(drive.endedAt)}</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Time" value={`${drive.minutes} min`} />
          <Stat label="Distance" value={drive.distanceM == null ? "Not saved" : formatDistance(drive.distanceM)} />
          <Stat label="Mean speed" value={drive.meanSpeed == null ? "—" : `${drive.meanSpeed} km/h`} />
          <Stat label="Speed" value={drive.speedCompliance == null ? "—" : String(drive.speedCompliance)} />
        </dl>
        <p className="mt-4 text-sm">{`${drive.harshBrakes} harsh ${drive.harshBrakes === 1 ? "brake" : "brakes"} · ${drive.harshAccelerations} rapid ${drive.harshAccelerations === 1 ? "acceleration" : "accelerations"}`}</p>
        {compared ? <p className="mt-2 text-sm text-muted">{compared}</p> : null}
        {drive.notes.slice(0, 2).map((note) => <p key={note} className="mt-2 text-sm text-muted">{note}</p>)}
        <p className="mt-3"><Source source={drive.source} /></p>
        <Link href={open ? recordHref(window) : recordHref(window, drive.id)} className="mt-3 inline-flex text-sm underline">{open ? "Close" : "Open"}</Link>
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-2 text-lg">{value}</dd>
    </div>
  );
}

function Trend({ ws }: { ws: Workspace }) {
  const points = TREND.map((item) => ({
    ...item,
    value: ws.entitlements.historicalAnalytics || item.id !== "6months" ? ws.scores[item.id].overall : null,
  }));
  const ready = points.filter((point) => point.value != null) as { id: string; label: string; value: number }[];
  const sentence = ready.map((point) => `${point.label} ${point.value}`).join(" · ");
  if (ready.length < 2) return <p className="mt-4 text-sm text-muted">A trend needs more than one window with enough driving.</p>;
  const w = 640;
  const h = 220;
  const min = Math.min(...ready.map((point) => point.value)) - 8;
  const max = Math.max(...ready.map((point) => point.value)) + 8;
  const span = max - min || 1;
  const place = (index: number, value: number) => {
    const x = (index / (ready.length - 1)) * (w - 80) + 40;
    const y = 28 + (1 - (value - min) / span) * (h - 84);
    return { x, y };
  };
  const d = ready.map((point, index) => {
    const { x, y } = place(index, point.value);
    return `${index === 0 ? "M" : "L"}${x} ${y}`;
  }).join(" ");
  const first = place(0, ready[0].value);
  const last = place(ready.length - 1, ready[ready.length - 1].value);
  const floor = h - 44;
  return (
    <div className="mt-5">
      <p className="text-lg">{sentence}</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full" role="img" aria-label={`Score across windows: ${sentence}`}>
        {[0, 1, 2].map((step) => {
          const y = 28 + (step / 2) * (h - 84);
          return <line key={step} x1="32" x2={w - 24} y1={y} y2={y} stroke="#e2dcd0" strokeWidth="1" />;
        })}
        <path d={`${d} L${last.x} ${floor} L${first.x} ${floor} Z`} fill="#161712" opacity="0.06" />
        <path d={d} fill="none" stroke="#161712" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {ready.map((point, index) => {
          const { x, y } = place(index, point.value);
          return (
            <g key={point.id}>
              <circle cx={x} cy={y} r="5" fill="#fbf9f4" stroke="#161712" strokeWidth="2" />
              <text x={x} y={y - 14} textAnchor="middle" fontSize="16" fill="#161712">{point.value}</text>
              <text x={x} y={h - 16} textAnchor="middle" fontSize="13" fill="#5e584e">{point.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
