import Link from "next/link";
import { AUDIT_KEEP_DAYS, NOTE_KEEP_DAYS, SAMPLE_KEEP_DAYS } from "@/domain/retention";
import { driverHealth, fleetHealth, openingCard } from "@/domain/intelligence";
import { accraParts, formatDay, formatWhen, ghs } from "@/domain/dates";
import { exchange } from "@/domain/languages";
import { planById, pricingConfig } from "@/config/pricing";
import { briefScript, plainAlert } from "@/domain/companion";
import type { DrivePrefs } from "@/domain/drive-prefs";
import type { Workspace } from "@/domain/types";
import { deleteAccountAction, markNotificationAction, requestPlanAction } from "@/server/actions";
import { DrivePrefsForm, DriverForm, FleetCreateForm, PrefsForm } from "./forms";
import { Listen } from "./listen";
import { SignOutButton } from "./shell";
import { EmptyState, Source, Status } from "./ui";

export function DocumentsScreen({ ws }: { ws: Workspace }) {
  if (!ws.documents.length) {
    return <EmptyState title="The vault is empty." body="Insurance, roadworthiness, registration, ownership, your licence, a sale agreement. Add the date printed on the paper. Verification with government is not connected." action={<Link className="btn" href="/documents/new">Add a document</Link>} />;
  }
  return (
    <div className="grid gap-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Vault</p>
          <h1 className="display mt-3 text-5xl">Documents</h1>
        </div>
        <Link className="btn" href="/documents/new">Add</Link>
      </header>
      <ul className="grid gap-3">
        {ws.documents.map((doc) => (
          <li key={doc.id} className="card px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg">{doc.label}</h2>
                <p className="text-sm text-muted">{doc.expiresOn ? `Expires ${formatDay(doc.expiresOn)}` : "No expiry entered"} · Updated {formatDay(doc.updatedAt.slice(0, 10))}</p>
              </div>
              <Status tone={doc.status === "valid" ? "good" : doc.status === "expiring" ? "warn" : doc.status === "expired" || doc.status === "missing" ? "bad" : "info"}>
                {doc.status === "unknown" ? "Date needed" : doc.status}
              </Status>
            </div>
            <p className="mt-3 text-sm">{doc.verificationLabel}</p>
            <div className="mt-2"><Source source={doc.source} /></div>
            {doc.hasFile ? <a className="mt-3 inline-block text-sm underline" href={`/api/files/${doc.id}`}>Preview file</a> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NotificationsScreen({ ws, topic }: { ws: Workspace; topic: string }) {
  const topics = ["everything", "traffic", "vehicle", "safety", "system"] as const;
  const items = ws.notifications.filter((n) => !n.archived && (topic === "everything" || n.topic === topic));
  return (
    <div className="grid gap-6">
      <header>
        <p className="eyebrow">Notifications</p>
        <h1 className="display mt-3 text-5xl">What changed</h1>
      </header>
      <div className="flex flex-wrap gap-2">
        {topics.map((id) => (
          <Link key={id} href={`/notifications?topic=${id}`} className={topic === id ? "btn" : "btn btn-ghost"}>
            {id}
          </Link>
        ))}
      </div>
      {items.length === 0 ? <EmptyState title="Quiet." body="Nothing in this tray needs you. Urgent items always show, even if you quiet the rest." /> : (
        <ul className="divide-y divide-line border-y border-line">
          {items.map((n) => (
            <li key={n.id} className="grid gap-2 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow">{n.category}</p>
                {!n.read ? <span className="text-xs">Unread</span> : null}
              </div>
              <Link href={n.href} className="text-lg">{n.title}</Link>
              <p className="text-sm text-muted">{n.body}</p>
              <Source source={n.source} />
              <form action={markNotificationAction} className="flex gap-2">
                <input type="hidden" name="id" value={n.id} />
                <button className="text-sm underline" name="op" value="read" type="submit">Mark read</button>
                <button className="text-sm underline" name="op" value="archive" type="submit">Archive</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <Link href="/settings/notifications" className="text-sm underline">Notification preferences</Link>
    </div>
  );
}

export function FleetScreen({ ws }: { ws: Workspace }) {
  if (!ws.entitlements.fleet && ws.mode !== "demo") {
    return (
      <EmptyState
        title="Fleet is a separate plan."
        body="You can request it. Payment collection is not connected, so the dashboard stays closed and nothing is charged. When a plan is active, drivers you add start with empty scores — Nokware will not invent them."
        action={<Link className="btn" href="/settings/subscription">See plans</Link>}
      />
    );
  }
  const fleet = ws.fleet;
  if (!fleet) {
    return (
      <div className="grid gap-6">
        <h1 className="display text-5xl">Name the fleet.</h1>
        <p className="max-w-md text-muted">Only drivers you add will appear. There is no sample packed into a real account.</p>
        <FleetCreateForm />
      </div>
    );
  }
  return (
    <div className="grid gap-8">
      <header>
        <p className="eyebrow">{fleet.sample ? "Sample fleet · demo data" : "Fleet"}</p>
        <h1 className="display mt-3 text-5xl">{fleet.counts.total} vehicles</h1>
        <p className="mt-2 text-muted">{fleet.name}. Counts are calculated from the rows below.</p>
        <p className="mt-2 text-sm text-muted">
          {(() => {
            const health = fleetHealth(fleet.drivers.map((driver) => driver.score.overall));
            return `${health.overall == null ? health.note : `Fleet health ${health.overall}. ${health.note}`}${fleet.sample ? " DEMO." : ""}`;
          })()}
        </p>
        <p className="mt-2 max-w-lg text-sm text-muted">
          {fleet.sample
            ? "These drivers are a sample. Their scores are not yours. A score appears only after enough saved driving, on the same formula as a personal score."
            : "A score appears only after that driver has enough saved driving. The formula is the same as your own score. A blank score is not a zero."}
        </p>
      </header>
      <dl className="grid grid-cols-3 gap-4">
        <Count label="Good" value={fleet.counts.good} />
        <Count label="Attention" value={fleet.counts.attention} />
        <Count label="High risk" value={fleet.counts.highRisk} />
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="py-2 font-medium">Vehicle</th>
              <th className="font-medium">Driver</th>
              <th className="font-medium">{fleet.sample ? "Sample score" : "Score"}</th>
              <th className="font-medium">Compliance</th>
              <th className="font-medium">Violations</th>
              <th className="font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {fleet.drivers.map((d) => (
              <tr key={d.id} className="border-t border-line">
                <td className="py-3">{d.plate}<span className="block text-muted">{d.vehicleLabel}</span></td>
                <td><Link className="underline" href={`/fleet/drivers/${d.id}`}>{d.name}</Link></td>
                <td className="numeric text-2xl">{d.score.overall ?? "Not enough"}</td>
                <td>{d.compliance == null ? "Not linked" : `${d.compliance}%`}</td>
                <td>{d.openViolations}</td>
                <td>{d.standing.replaceAll("_", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ws.mode === "user" ? <DriverForm /> : <p className="text-sm text-muted">Demo fleet rows are fixed. Create an account to add your own drivers.</p>}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="numeric mt-2 text-5xl">{value}</dd>
    </div>
  );
}

export function DriverDetail({ ws, id }: { ws: Workspace; id: string }) {
  const driver = ws.fleet?.drivers.find((d) => d.id === id);
  if (!driver) return <EmptyState title="Driver not on this fleet." body="They may have been removed, or this is the wrong account." />;
  return (
    <article className="grid gap-6">
      <p className="eyebrow">Driver {driver.dataClass === "DEMO" ? "· demo data" : ""}</p>
      <h1 className="display text-5xl">{driver.name}</h1>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Mini label="Score" value={driver.score.overall == null ? "—" : String(driver.score.overall)} />
        <Mini label="Speed" value={driver.speedCompliance == null ? "—" : `${driver.speedCompliance}%`} />
        <Mini label="Harsh braking" value={String(driver.harshBrakes)} />
        <Mini label="Violations" value={String(driver.openViolations)} />
      </dl>
      <p className="text-sm text-muted">{driver.score.note}</p>
      <p>Documents: {driver.documentStatus}</p>
      <p className="text-sm text-muted">{driver.plate} · {driver.vehicleLabel}</p>
    </article>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="numeric mt-1 text-4xl">{value}</dd></div>;
}

export function BriefScreen({ ws, prefs }: { ws: Workspace; prefs: DrivePrefs }) {
  const focus = ws.attention.find((item) => item.severity === "urgent" || item.severity === "attention")
    ?? ws.attention.find((item) => item.severity === "info")
    ?? null;
  const card = openingCard({
    heroState: ws.hero.state,
    heroTitle: ws.hero.title,
    greeting: ws.greeting,
    vehicle: ws.activeVehicle ? { id: ws.activeVehicle.id, standing: ws.activeVehicle.standing } : null,
    documents: ws.documents,
    activeViolations: ws.totals.activeViolations,
    score: ws.score.overall,
    focus,
    demo: ws.mode === "demo",
  });
  const talk = exchange(prefs.lang, accraParts(new Date()).hour);
  const speech = briefScript({
    greeting: talk ?? ws.greeting,
    papersClear: card.checks != null,
    openNotices: ws.totals.activeViolations,
    focusTitle: focus?.title ?? null,
  }).join(" ");
  return (
    <article className="mx-auto grid min-h-[70vh] max-w-xl content-center gap-8 py-10">
      <p className="eyebrow">{talk ?? ws.greeting.split(",")[0]}</p>
      <h1 className="display text-6xl sm:text-7xl">{prefs.easy ? (focus ? "Something needs you." : ws.brief.headline) : ws.brief.headline}</h1>
      <Listen text={speech} label="Listen" lang={prefs.lang} />
      <ul className="grid gap-3 text-lg">
        {ws.brief.checks.map((check) => (
          <li key={check.label} className="flex gap-3">
            <span aria-hidden>{check.ok ? "✓" : "–"}</span>
            {check.label}
          </li>
        ))}
      </ul>
      {ws.brief.oneThing ? (
        <section>
          <p className="eyebrow">One thing to know</p>
          <h2 className="display mt-3 text-4xl">{prefs.easy ? plainAlert(ws.brief.oneThing.title) : ws.brief.oneThing.title}</h2>
          <p className="mt-3 text-muted">{ws.brief.oneThing.detail}</p>
          <Link href={ws.brief.oneThing.href} className="btn mt-6">View</Link>
        </section>
      ) : null}
    </article>
  );
}

export function ProfileScreen({ ws }: { ws: Workspace }) {
  const health = driverHealth({
    driverScore: ws.score.overall,
    vehicleCompliance: ws.activeVehicle?.compliance ?? null,
    openObligations: ws.totals.activeViolations,
  });
  const links = [
    ["/now", "Driving screen"],
    ["/protect", "Protection"],
    ["/work", "Work"],
    ["/emergency", "Emergency card"],
    ["/score", "Driver score"],
    ["/documents", "Documents"],
    ["/traffic", "Violations"],
    ["/notifications", "Notifications"],
    ["/ask", "Intelligence"],
    ["/fleet", "Fleet"],
    ["/brief", "Daily brief"],
    ["/services", "Services"],
    ["/analytics", "Analytics"],
    ["/settings", "Settings"],
  ];
  return (
    <div>
      <p className="eyebrow">Safe driver profile</p>
      <h1 className="display mt-3 text-5xl">{ws.viewer.name}</h1>
      <p className="mt-2 text-muted capitalize">{ws.viewer.plan}{ws.viewer.planStatus === "pending_checkout" ? " · requested, not charged" : ""}</p>
      <dl className="mt-8 grid max-w-lg gap-4 text-sm">
        <div className="flex justify-between gap-4 border-b border-line pb-3"><dt>Driver score</dt><dd>{ws.score.overall ?? ws.score.note}</dd></div>
        <div className="flex justify-between gap-4 border-b border-line pb-3"><dt>Driver health</dt><dd>{health.overall == null ? health.note : `${health.overall} · ${health.band}`}</dd></div>
        <div className="flex justify-between gap-4 border-b border-line pb-3"><dt>Open obligations</dt><dd>{ws.totals.activeViolations}</dd></div>
        <div className="flex justify-between gap-4 border-b border-line pb-3"><dt>Vehicle</dt><dd>{ws.activeVehicle?.standingLabel ?? "No vehicle saved"}</dd></div>
      </dl>
      <p className="mt-3 max-w-lg text-xs text-muted">{health.note} {health.source === "CALCULATED" ? "Calculated." : ""} {ws.mode === "demo" ? "DEMO." : ""} This profile is not shared with an insurer or an employer.</p>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {links.map(([href, label]) => (
          <li key={href}><Link className="flex min-h-14 items-center" href={href}>{label}</Link></li>
        ))}
      </ul>
    </div>
  );
}

export function SettingsScreen({ ws, prefs }: { ws: Workspace; prefs: DrivePrefs }) {
  return (
    <div className="grid max-w-xl gap-8">
      <header>
        <p className="eyebrow">Settings</p>
        <h1 className="display mt-3 text-5xl">Your account</h1>
        <p className="mt-3 text-muted">{ws.viewer.email}</p>
      </header>
      <section className="grid gap-3">
        <h2 className="text-2xl">Driving</h2>
        <DrivePrefsForm prefs={prefs} />
      </section>
      <ul className="divide-y divide-line border-y border-line">
        {[
          ["/now", "Driving screen"],
          ["/protect", "Protection"],
          ["/work", "Work"],
          ["/emergency", "Emergency card"],
          ["/settings/notifications", "Notifications"],
          ["/settings/subscription", "Plan"],
          ["/settings/privacy", "Privacy centre"],
          ["/onboarding?replay=1", "Take the tour"],
        ].map(([href, label]) => (
          <li key={href}><Link className="flex min-h-14 items-center" href={href}>{label}</Link></li>
        ))}
      </ul>
      <SignOutButton />
      <a className="btn btn-ghost w-fit" href="/api/export">Export a copy</a>
      <form action={deleteAccountAction}>
        <button className="text-sm text-bad underline" type="submit">Delete account and documents</button>
      </form>
    </div>
  );
}

export function PlanScreen({ ws }: { ws: Workspace }) {
  return (
    <div className="grid gap-6">
      <header>
        <p className="eyebrow">Plans</p>
        <h1 className="display mt-3 text-5xl">Pay for depth, not for safety.</h1>
        <p className="mt-3 max-w-lg text-muted">Prices come from the operator config. Checkout is {pricingConfig.checkoutConnected ? "connected" : "not connected"}.</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-3">
        {pricingConfig.plans.map((plan) => (
          <article key={plan.id} className="card flex flex-col px-5 py-5">
            <h2 className="text-xl">{plan.name}</h2>
            <p className="numeric mt-4 text-5xl">{plan.monthly === 0 ? "GH₵0" : ghs(plan.monthly)}</p>
            <p className="text-xs text-muted">{plan.monthly === 0 ? "Forever" : `a month · ${ghs(plan.yearly)} a year`}</p>
            <p className="mt-3 text-sm text-muted">{plan.blurb}</p>
            <ul className="mt-4 grid flex-1 gap-2 text-sm">
              {plan.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <form action={requestPlanAction} className="mt-5">
              <input type="hidden" name="plan" value={plan.id} />
              <button className="btn w-full" type="submit" disabled={ws.mode === "demo"}>
                {plan.id === "free" ? "Use Free" : pricingConfig.checkoutConnected ? "Continue" : "Request this plan"}
              </button>
            </form>
          </article>
        ))}
      </div>
      {ws.viewer.planStatus === "pending_checkout" ? (
        <p className="text-sm">You requested {planById(ws.viewer.plan).name}. No charge has been made. Free stays active until a real checkout exists.</p>
      ) : (
        <p className="text-sm text-muted">Current plan: {planById(ws.viewer.plan).name}.</p>
      )}
    </div>
  );
}

export function PrivacyScreen() {
  return (
    <article className="grid max-w-prose gap-4 text-[15px] leading-relaxed">
      <h1 className="display text-5xl">Privacy centre</h1>
      <p>Nokware stores the account, vehicles, document dates, files you upload, notices you paste, payments you record, and driving sessions you choose to save.</p>
      <p>A saved drive keeps speed samples, the limit you selected, and a shortened copy of the route so you can review the trip. It does not keep a continuous location trace. Demonstrations are not saved. You can delete one trip, or the whole account, from Settings.</p>
      <p>
        Speed samples stay for {SAMPLE_KEEP_DAYS} days, longer than the six-month score. After that the trip row stays and the raw speeds and route points are removed. Questions stay for {NOTE_KEEP_DAYS / 365} years. The change log stays for {AUDIT_KEEP_DAYS / 365} years. Notices stay for one year. Papers, payments, vehicles, and the account are not removed by this schedule.
      </p>
      <p>Each save keeps the previous copy of the file. If the current file cannot be read, Nokware opens that previous copy. If both copies are damaged, it stops and does not replace them with an empty account.</p>
      <p>Driver Intelligence receives a reduced context: first name, score, vehicle, document dates, notice fields. It does not receive your password, file contents, or buyer phone number.</p>
      <p>Nothing is sent to DVLA, the Police, NIC or an insurer by this app. There is no official connection to pretend otherwise.</p>
      <p>A copy of your last status is kept in this browser so a poor connection can show it as stale. Sign out of shared phones. Export and deletion are in Settings.</p>
      <PrefsLink />
    </article>
  );
}

function PrefsLink() {
  return <Link href="/settings" className="underline">Back to settings</Link>;
}

export function NotificationSettings({ ws }: { ws: Workspace }) {
  return (
    <div className="max-w-md">
      <h1 className="display text-5xl">Alerts</h1>
      <div className="mt-6"><PrefsForm prefs={ws.prefs} /></div>
    </div>
  );
}

export function AnalyticsScreen({ ws }: { ws: Workspace }) {
  return (
    <div className="grid gap-6">
      <header>
        <p className="eyebrow">Analytics</p>
        <h1 className="display mt-3 text-5xl">Am I improving?</h1>
      </header>
      <p className="max-w-lg text-muted">Charts only appear when the underlying records exist. Empty space is not filled with a decorative line.</p>
      <Link href="/score" className="text-sm underline">Open the score, which is the chart that answers this.</Link>
      <p className="text-sm">Saved drives: {ws.sessions.length}. Open notices: {ws.totals.activeViolations}. Documents with dates: {ws.documents.filter((d) => d.expiresOn).length}.</p>
    </div>
  );
}

export function AdminScreen({
  users,
  audits,
}: {
  users: { email: string; plan: string; role: string; vehicles: number }[];
  audits: { action: string; at: string }[];
}) {
  return (
    <div className="grid gap-6">
      <h1 className="display text-5xl">Operations</h1>
      <p className="text-sm text-muted">Visible only to admin accounts. No driver can open this from their navigation.</p>
      <table className="w-full text-left text-sm">
        <thead><tr><th className="py-2">Email</th><th>Plan</th><th>Role</th><th>Vehicles</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.email} className="border-t border-line"><td className="py-2">{u.email}</td><td>{u.plan}</td><td>{u.role}</td><td>{u.vehicles}</td></tr>
          ))}
        </tbody>
      </table>
      <h2 className="text-lg">Recent audit</h2>
      <ul className="text-sm text-muted">
        {audits.slice(-12).reverse().map((a, i) => <li key={i}>{formatWhen(a.at)} · {a.action}</li>)}
      </ul>
      <p className="text-sm">Health: <a className="underline" href="/api/health">/api/health</a></p>
    </div>
  );
}
