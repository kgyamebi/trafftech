import Link from "next/link";
import { workWindow } from "@/domain/companion";
import { ghs } from "@/domain/dates";
import type { DrivePrefs } from "@/domain/drive-prefs";
import { ROLES } from "@/domain/drive-prefs";
import type { Workspace } from "@/domain/types";
import { deleteExpenseAction } from "@/server/actions";
import { ExpenseForm } from "./forms";

export function WorkScreen({ ws, prefs }: { ws: Workspace; prefs: DrivePrefs }) {
  const role = ROLES.find((item) => item.id === prefs.role)?.label ?? "Private car";
  const summary = workWindow(
    ws.sessions.map((session) => ({ startedAt: session.startedAt, endedAt: session.endedAt })),
    ws.expenses.map((row) => ({ spentOn: row.spentOn, amountGhs: row.amountGhs, direction: row.direction })),
    new Date(ws.generatedAt),
  );
  const money = (value: number | null) => (value == null ? "Nothing entered" : ghs(value));
  return (
    <div className="grid max-w-xl gap-8">
      <header>
        <p className="eyebrow">{role}</p>
        <h1 className="display mt-3 text-5xl">Today on the road</h1>
        <p className="mt-3 text-muted">Trips and papers already saved. Costs appear only after you enter them.</p>
        {ws.mode === "demo" ? <p className="mt-2 text-sm">DEMO. The trips below are a sample, not your driving time.</p> : null}
      </header>
      <dl className="grid grid-cols-2 gap-4">
        <Cell label="Trips today" value={String(summary.todayTrips)} />
        <Cell label="Minutes today" value={String(summary.todayMinutes)} />
        <Cell label="Trips this week" value={String(summary.weekTrips)} />
        <Cell label="Minutes this week" value={String(summary.weekMinutes)} />
      </dl>
      <section>
        <h2 className="display text-3xl">Papers</h2>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {ws.statuses.map((status) => (
            <li key={status.id}>
              <Link href={status.href} className="flex min-h-14 items-center justify-between gap-4">
                <span>{status.label}</span>
                <span>{status.value}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="display text-3xl">Notices</h2>
        <p className="mt-2">{ws.totals.activeViolations === 0 ? "No open notices." : `${ws.totals.activeViolations} open.`}</p>
        <Link href="/traffic" className="mt-3 inline-flex min-h-11 items-center underline">See notices</Link>
      </section>
      <section className="grid gap-4">
        <h2 className="display text-3xl">Costs</h2>
        <dl className="grid grid-cols-2 gap-4">
          <Cell label="This week out" value={money(summary.weekOut)} />
          <Cell label="This month out" value={money(summary.monthOut)} />
          <Cell label="Money in this month" value={money(summary.monthIn)} />
        </dl>
        <p className="text-sm text-muted">{summary.trend}</p>
        {ws.expenses.length === 0 ? <p>No fuel, repairs, or other costs saved.</p> : (
          <ul className="divide-y divide-line border-y border-line">
            {ws.expenses.map((row) => (
              <li key={row.id} className="flex min-h-14 items-center justify-between gap-3">
                <span className="capitalize">{row.kind} · {row.spentOn}</span>
                <span className="flex items-center gap-3">
                  {row.direction === "in" ? "+" : "−"}{ghs(row.amountGhs)}
                  {ws.mode === "user" ? (
                    <form action={deleteExpenseAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <button className="text-sm underline" type="submit">Remove</button>
                    </form>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        <ExpenseForm locked={ws.mode === "demo"} />
      </section>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="numeric mt-1 text-4xl">{value}</dd>
    </div>
  );
}
