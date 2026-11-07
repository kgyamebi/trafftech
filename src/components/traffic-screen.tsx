import Link from "next/link";
import { deadlineLabel } from "@/domain/assemble";
import { violationScript } from "@/domain/companion";
import { ghs, formatDay, formatWhen } from "@/domain/dates";
import { OFFICIAL_FINE_CHANNELS } from "@/domain/fines";
import type { ViolationView, Workspace } from "@/domain/types";
import { Listen } from "./listen";
import { EmptyState, Source, Status } from "./ui";

export function TrafficScreen({ ws, tab }: { ws: Workspace; tab: string }) {
  const active = ws.violations.filter((v) => ["action_required", "overdue", "contest_in_preparation"].includes(v.status));
  const history = ws.violations.filter((v) => v.status === "paid_user_reported" || v.status === "closed");
  const tabs = [
    ["active", "Active"],
    ["history", "History"],
    ["payments", "Payments"],
    ["evidence", "Evidence"],
  ] as const;
  return (
    <div className="grid gap-8">
      <header>
        <p className="eyebrow">Traffic centre</p>
        <h1 className="display mt-3 text-5xl sm:text-6xl">{ws.totals.activeViolations === 0 ? "Clear" : "Open"}</h1>
        <p className="mt-3 max-w-lg text-muted">Notices you imported or saved. Nokware is not connected to TraffiTech, the Police, or the courts.</p>
      </header>
      <dl className="grid grid-cols-3 gap-4 border-y border-line py-5">
        <Stat label="Outstanding" value={ghs(ws.totals.outstandingGhs)} />
        <Stat label="Active" value={String(ws.totals.activeViolations)} />
        <Stat label="Paid this year" value={ghs(ws.totals.paidThisYearGhs)} />
      </dl>
      <div className="flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <Link key={id} href={`/traffic?tab=${id}`} className={tab === id ? "btn" : "btn btn-ghost"} aria-current={tab === id ? "page" : undefined}>
            {label}
          </Link>
        ))}
        <Link href="/traffic/inbox" className="btn btn-ghost">Import a notice</Link>
      </div>
      {tab === "payments" ? <Payments ws={ws} /> : null}
      {tab === "evidence" ? <EvidenceIndex ws={ws} /> : null}
      {tab === "active" ? <List items={active} emptyTitle="No open notices." emptyBody="Great news. You currently have no recorded traffic notices that need a decision." /> : null}
      {tab === "history" ? <List items={history} emptyTitle="No history yet." emptyBody="Paid or closed notices you record will sit here, with the source labelled." /> : null}
    </div>
  );
}

function List({ items, emptyTitle, emptyBody }: { items: ViolationView[]; emptyTitle: string; emptyBody: string }) {
  if (!items.length) return <EmptyState title={emptyTitle} body={emptyBody} />;
  return (
    <ul className="grid gap-4">
      {items.map((v) => (
        <li key={v.id}>
          <article className="card px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">{v.title}</p>
                <h2 className="mt-2 text-2xl">{formatWhen(v.occurredAt)}</h2>
              </div>
              <Status tone={v.status === "paid_user_reported" || v.status === "closed" ? "good" : v.status === "contest_in_preparation" ? "warn" : "bad"}>
                {v.status.replaceAll("_", " ")}
              </Status>
            </div>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Location</dt><dd>{v.locationLabel || "Not entered"}</dd></div>
              <div><dt className="text-muted">Fine</dt><dd className="numeric text-3xl tracking-normal">{ghs(v.amountGhs)}</dd></div>
            </dl>
            <p className="mt-4 text-sm">
              {v.status === "paid_user_reported"
                ? "Recorded as paid by the person who entered it. Not confirmed by an authority."
                : deadlineLabel(v.daysRemaining, v.deadlineConfirmed)}
            </p>
            <div className="mt-4"><Source source={v.source} /></div>
            <div className="mt-5 flex flex-wrap gap-4 text-sm">
              <Link className="underline underline-offset-4" href={`/traffic/${v.id}/evidence`}>Review evidence</Link>
              <Link className="underline underline-offset-4" href={`/traffic/${v.id}`}>Official payment information</Link>
              <Link className="underline underline-offset-4" href={`/traffic/${v.id}/contest`}>Contest information</Link>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}

function Payments({ ws }: { ws: Workspace }) {
  if (!ws.payments.length) return <EmptyState title="No payments recorded." body="When you pay an authority and tell Nokware, the note appears here. We never mark one paid on our own." />;
  return (
    <ul className="divide-y divide-line border-y border-line">
      {ws.payments.map((p) => (
        <li key={p.id} className="grid gap-1 py-4 sm:grid-cols-[1fr_auto]">
          <div>
            <p>{p.title}</p>
            <p className="text-sm text-muted">{formatDay(p.paidOn)} · {p.reference}</p>
            <Source source={p.source} />
          </div>
          <p className="numeric text-3xl">{ghs(p.amountGhs)}</p>
        </li>
      ))}
    </ul>
  );
}

function EvidenceIndex({ ws }: { ws: Workspace }) {
  const withEvidence = ws.violations.filter((v) => v.evidence.length > 0);
  if (!withEvidence.length) {
    return <EmptyState title="Evidence unavailable through connected sources." body="There is no official evidence feed. If you have a photo, video or note, attach it from the notice." />;
  }
  return (
    <ul className="grid gap-3">
      {withEvidence.map((v) => (
        <li key={v.id}>
          <Link href={`/traffic/${v.id}/evidence`} className="card block px-5 py-4">
            {v.title}
            <span className="mt-1 block text-sm text-muted">{v.evidence.length} item{v.evidence.length === 1 ? "" : "s"} · {v.source === "DEMO" ? "Demo illustration" : "Saved by you"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="numeric mt-2 text-3xl sm:text-4xl">{value}</dd>
    </div>
  );
}

export function ViolationDetail({ ws, id }: { ws: Workspace; id: string }) {
  const v = ws.violations.find((item) => item.id === id);
  if (!v) return <EmptyState title="That notice is not here." body="It may belong to another account, or it was never saved." />;
  return (
    <article className="grid gap-8">
      <header>
        <p className="eyebrow">Notice</p>
        <h1 className="display mt-3 text-5xl">{v.title}</h1>
        <p className="mt-3 text-muted">{formatWhen(v.occurredAt)} · {v.locationLabel || "Location not saved"}</p>
        <div className="mt-4">
          <Listen
            label="Listen"
            text={violationScript({
              title: v.title,
              status: v.status,
              recordedSpeedKph: v.recordedSpeedKph,
              applicableLimitKph: v.applicableLimitKph,
              daysRemaining: v.daysRemaining,
              deadlineConfirmed: v.deadlineConfirmed,
              amountGhs: v.amountGhs,
            }).join(" ")}
          />
        </div>
      </header>
      {v.daysRemaining != null && v.deadlineConfirmed && (v.status === "action_required" || v.status === "overdue") ? (
        <section className="card px-6 py-8 text-center">
          <p className="eyebrow">Date you confirmed</p>
          <p className="numeric mt-3 text-7xl">{Math.abs(v.daysRemaining)}</p>
          <p className="mt-2 text-sm text-muted">{v.daysRemaining < 0 ? "days past that date" : "days remaining"}</p>
          <p className="numeric mt-6 text-4xl">{ghs(v.amountGhs)}</p>
          {v.lateEstimateGhs ? <p className="mt-2 text-sm text-muted">Educational late addition {ghs(v.lateEstimateGhs)}. The portal balance controls.</p> : null}
        </section>
      ) : null}
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted">Recorded speed</dt><dd>{v.recordedSpeedKph ?? "—"} km/h</dd></div>
        <div><dt className="text-muted">Applicable limit entered</dt><dd>{v.applicableLimitKph ?? "—"} km/h</dd></div>
        <div><dt className="text-muted">Ticket number</dt><dd>{v.ticketNumber ?? "Not in the text"}</dd></div>
        <div><dt className="text-muted">Source</dt><dd><Source source={v.source} /></dd></div>
      </dl>
      {v.scamAssessment === "suspicious" ? (
        <div className="rounded-[16px] border border-warn/30 bg-warn-soft px-5 py-4 text-sm">
          Suspicious message. This does not match the known official pattern. Confirm only through a published Police channel before you pay anyone.
        </div>
      ) : null}
      {v.rawMessage ? <pre className="overflow-auto whitespace-pre-wrap rounded-[16px] bg-sunken p-4 text-sm">{v.rawMessage}</pre> : null}
      <section className="grid gap-3 border-t border-line pt-6 text-sm leading-relaxed">
        <h2 className="text-lg">Official payment information</h2>
        <p>Official connection unavailable. Nokware does not collect this fine.</p>
        <p>The Ghana Police Service publishes payment at <a className="underline" href={OFFICIAL_FINE_CHANNELS.portal} target="_blank" rel="noreferrer">{OFFICIAL_FINE_CHANNELS.portal}</a> and the short code {OFFICIAL_FINE_CHANNELS.payShortCode}. Outstanding checks are published on {OFFICIAL_FINE_CHANNELS.checkShortCode}. Confirm the channels on the <a className="underline" href={OFFICIAL_FINE_CHANNELS.policeFaq} target="_blank" rel="noreferrer">Police TraffiTech page</a> before you use them. Numbers can change.</p>
      </section>
      <div className="flex flex-wrap gap-3">
        <Link className="btn" href={`/traffic/${v.id}/evidence`}>Evidence</Link>
        <Link className="btn btn-ghost" href={`/traffic/${v.id}/contest`}>Contest notes</Link>
      </div>
    </article>
  );
}

export function OfficialChannels() {
  return null;
}
