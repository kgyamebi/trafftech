import Link from "next/link";
import { docStatusLabel, statusTone } from "@/domain/compliance";
import { formatDay } from "@/domain/dates";
import type { Workspace } from "@/domain/types";
import { selectVehicleAction } from "@/server/actions";
import { EmptyState, Source, Status } from "./ui";

export function VehicleScreen({ ws, focusId }: { ws: Workspace; focusId?: string }) {
  const vehicle = (focusId ? ws.vehicles.find((v) => v.id === focusId) : null) ?? ws.activeVehicle;
  if (!vehicle) {
    return (
      <EmptyState
        title="No vehicle yet."
        body="When you add one, this becomes the garage: plate, standing, and the papers that decide if it should be on the road."
        action={<Link className="btn" href="/vehicle/new">Add a vehicle</Link>}
      />
    );
  }
  const docs = ws.documents.filter((d) => d.vehicleId === vehicle.id || d.kind === "licence");
  return (
    <div className="grid gap-10">
      <header>
        <p className="eyebrow">Garage</p>
        <p className="mt-4 text-3xl" aria-hidden>🚗</p>
        <h1 className="numeric mt-4 text-6xl tracking-normal">{vehicle.plate}</h1>
        <p className="mt-2 text-xl">{vehicle.name}{vehicle.year ? ` · ${vehicle.year}` : ""}{vehicle.colour ? ` · ${vehicle.colour}` : ""}</p>
        <div className="mt-4">
          <Status tone={vehicle.standing === "good" ? "good" : vehicle.standing === "high_risk" ? "bad" : vehicle.standing === "attention" ? "warn" : "info"}>
            {vehicle.standingLabel}
          </Status>
        </div>
      </header>

      {ws.vehicles.length > 1 ? (
        <form action={selectVehicleAction} className="flex flex-wrap gap-2">
          {ws.vehicles.map((v) => (
            <button key={v.id} className={v.id === vehicle.id ? "btn" : "btn btn-ghost"} name="vehicleId" value={v.id} type="submit">
              {v.plate}
            </button>
          ))}
        </form>
      ) : null}

      <ul className="grid gap-px overflow-hidden rounded-[16px] border border-line bg-line sm:grid-cols-2">
        {ws.statuses.map((s) => (
          <li key={s.id} className="bg-raised">
            <Link href={s.href} className="block min-h-11 px-5 py-5">
              <p className="eyebrow">{s.label}</p>
              <div className="mt-3"><Status tone={s.tone}>{s.value}</Status></div>
            </Link>
          </li>
        ))}
      </ul>

      <section>
        <div className="flex items-end justify-between gap-4">
          <h2 className="display text-3xl">Documents</h2>
          <Link href="/documents" className="text-sm underline underline-offset-4">Open vault</Link>
        </div>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {docs.map((doc) => (
            <li key={doc.id} className="grid gap-2 py-4 sm:grid-cols-[1.2fr_0.8fr_0.8fr]">
              <div>
                <p>{doc.label}</p>
                <Source source={doc.source} />
              </div>
              <p className="text-sm text-muted">
                {doc.expiresOn ? formatDay(doc.expiresOn) : "No expiry entered"}
                {" · "}
                <Status tone={statusTone(doc.status)}>{docStatusLabel(doc.status)}</Status>
              </p>
              <p className="text-sm">{doc.verificationLabel}</p>
            </li>
          ))}
          {docs.length === 0 ? <li className="py-6 text-muted">No papers saved for this car.</li> : null}
        </ul>
      </section>

      <section>
        <h2 className="display text-3xl">Expiry timeline</h2>
        <ol className="mt-6 border-l border-line pl-6">
          {ws.timeline.filter((t) => docs.some((d) => d.id === t.id)).map((point) => (
            <li key={point.id} className="relative pb-8">
              <span className="absolute -left-[1.65rem] top-1 h-2.5 w-2.5 rounded-full bg-ink" aria-hidden />
              <p className="eyebrow">{point.days < 0 ? `${Math.abs(point.days)} days ago` : point.days === 0 ? "Today" : `${point.days} days`}</p>
              <p className="mt-1">{point.label}</p>
              <p className="text-sm text-muted">{formatDay(point.date)}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link className="btn btn-ghost" href={`/vehicle/${vehicle.id}/transfer`}>Ownership transfer</Link>
        {ws.mode === "user" && ws.entitlements.maxVehicles > ws.vehicles.length ? <Link className="btn" href="/vehicle/new">Add another</Link> : null}
      </div>
    </div>
  );
}
