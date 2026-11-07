"use client";

import { useActionState, useEffect, useState } from "react";
import { PageIntro, Source } from "@/components/ui";
import type { FieldPage } from "@/server/field-store";
import {
  confirmCommunityPlaceAction,
  reportCommunityPlaceAction,
  submitAskAction,
  editCommunityPlaceAction,
  confirmFieldEventAction,
  confirmFieldReportAction,
  removeFieldShareAction,
  setFieldSharingAction,
  submitCommunityPlaceAction,
  submitFieldEventAction,
  submitFieldReportAction,
} from "@/server/actions";

type FieldAction = (prev: { error: string }, formData: FormData) => Promise<{ error: string }>;

export function RoadsScreen({ field }: { field: FieldPage }) {
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [locateError, setLocateError] = useState("");
  const [rain, setRain] = useState(false);
  useEffect(() => {
    try {
      setRain(localStorage.getItem("nokware-field-rain") === "yes");
    } catch {
      /* private mode */
    }
  }, []);
  const [near, setNear] = useState<string>("");

  function locate() {
    if (!navigator.geolocation) {
      setLocateError("This phone cannot share a location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setHere({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocateError("");
      },
      () => setLocateError("Location is not available on this phone."),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 20_000 },
    );
  }

  function markRain(next: boolean) {
    setRain(next);
    try {
      localStorage.setItem("nokware-field-rain", next ? "yes" : "no");
    } catch {
      /* private mode */
    }
  }

  async function look() {
    if (!here) {
      setNear("Use this phone's location first.");
      return;
    }
    const response = await fetch(`/api/field/near?lat=${here.lat}&lng=${here.lng}${rain ? "&rain=yes" : ""}`);
    const body = (await response.json().catch(() => null)) as {
      note?: string;
      speed?: { status: string; meanKph: number | null; note: string };
      reports?: { label: string }[];
      places?: { name: string }[];
    } | null;
    if (!body) {
      setNear("This spot could not be read.");
      return;
    }
    if (!response.ok) {
      setNear(body.note ?? "This spot could not be read.");
      return;
    }
    const speed = body.speed?.status === "ready" && body.speed.meanKph != null ? `${body.speed.meanKph} km/h. ${body.speed.note}` : body.speed?.note ?? body.note ?? "";
    const reports = (body.reports ?? []).map((report) => report.label).filter(Boolean);
    const places = (body.places ?? []).map((place) => place.name).filter(Boolean);
    const reportLine = reports.length ? ` Nearby: ${reports.slice(0, 3).join(", ")}.` : "";
    const placeLine = places.length ? ` Places: ${places.slice(0, 2).join(", ")}.` : "";
    setNear(`${speed}${reportLine}${placeLine}`);
  }

  return (
    <div className="grid gap-10">
      <PageIntro
        kicker="Local roads"
        title="What drivers have shared"
        body="Speeds, prices, closures and places appear only after someone on an account puts them here. Empty means it is not known yet. This is not live traffic, a ministry feed, or a price list."
      />

      {field.canWrite ? null : (
        <p className="max-w-xl text-sm text-muted">This demonstration cannot share speeds or add reports. An account can. The figures below are not filled in for the demonstration.</p>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <Fact label="Roads with a published speed" value={field.census.publishedSpeeds} />
        <Fact label="Drivers sharing" value={field.census.driversSharing} />
        <Fact label="Confirmed reports" value={field.census.confirmedReports} />
      </section>
      <p className="max-w-xl text-sm text-muted">{field.census.note} <Source source={field.census.source} /></p>

      <section className="grid max-w-xl gap-3">
        <h2 className="text-2xl">What this can answer</h2>
        <p>{`Do drivers have a speed for this road? ${field.census.publishedSpeeds === 1 ? "1 road has" : `${field.census.publishedSpeeds} roads have`} a published speed. Where there is no number, it is not known.`}</p>
        <p>Can a report be relied on? A report other drivers have confirmed can be named near a route. The route order stays the same. This is not an official notice.</p>
        <p>{`How many people are generating this? ${field.census.driversSharing === 1 ? "1 account has" : `${field.census.driversSharing} accounts have`} chosen to share. That is a count of stored consents, not a guess about a larger crowd.`}</p>
        <p>{field.standingNote}</p>
      </section>

      <section className="grid max-w-xl gap-4">
        <h2 className="text-2xl">Sharing</h2>
        <p className="text-sm text-muted">Sharing is off until you turn it on. The saved trip on your account is unchanged. Your name is not attached to a shared speed. You can stop sharing, or remove what you shared.</p>
        <p className="text-sm">{field.policy}</p>
        <div className="flex flex-wrap gap-3">
          <Form action={setFieldSharingAction as FieldAction}>
            <input type="hidden" name="sharing" value={field.sharing ? "no" : "yes"} />
            <button className="btn" type="submit" disabled={!field.canWrite}>{field.sharing ? "Stop sharing speeds" : "Share speeds from my drives"}</button>
          </Form>
          <Form action={removeFieldShareAction as FieldAction}>
            <button className="btn btn-ghost" type="submit" disabled={!field.canWrite}>Remove what I shared</button>
          </Form>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={rain} onChange={(event) => markRain(event.target.checked)} />
          It is raining on the drive I am about to save. This is your mark, not a weather service.
        </label>
      </section>

      <section className="grid max-w-xl gap-4">
        <h2 className="text-2xl">From this phone</h2>
        <div className="flex flex-wrap gap-3">
          <button className="btn" type="button" onClick={locate}>Use this phone's location</button>
          <button className="btn btn-ghost" type="button" onClick={look}>Read this cell</button>
        </div>
        <p className="text-sm text-muted">{here ? `${here.lat.toFixed(5)}, ${here.lng.toFixed(5)}` : "No location yet."}</p>
        {locateError ? <p className="text-sm text-bad" role="alert">{locateError}</p> : null}
        {near ? <p className="text-sm">{near}</p> : null}

        <Form action={submitFieldReportAction as FieldAction}>
          <input type="hidden" name="lat" value={here?.lat ?? ""} />
          <input type="hidden" name="lng" value={here?.lng ?? ""} />
          <label className="grid gap-1 text-sm">Report
            <select name="kind" className="rounded-[12px] border border-line bg-transparent px-3 py-2" defaultValue="accident">
              {field.reportKinds.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Note
            <input name="note" maxLength={140} className="rounded-[12px] border border-line bg-transparent px-3 py-2" placeholder="What you saw" />
          </label>
          <label className="grid gap-1 text-sm">Fuel price per litre, if this is a price
            <input name="priceGhs" inputMode="decimal" className="rounded-[12px] border border-line bg-transparent px-3 py-2" placeholder="Leave empty unless it is a price" />
          </label>
          <button className="btn w-fit" type="submit" disabled={!field.canWrite || !here}>Send report</button>
        </Form>
        <ul className="grid gap-1 text-sm text-muted">
          {field.reportKinds.map((kind) => <li key={kind.id}>{kind.label}. {kind.detail}</li>)}
        </ul>
      </section>

      <section className="grid gap-3">
        <h2 className="text-2xl">Reports on accounts</h2>
        {field.openReports.length === 0 ? <p className="text-sm text-muted">None stored.</p> : field.openReports.map((report) => (
          <article key={report.id} className="card grid gap-2 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg">{report.label}</h3>
              <span className="text-xs uppercase tracking-wide text-muted">{report.status}{report.mine ? " · yours" : ""}</span>
            </div>
            {report.note ? <p className="text-sm">{report.note}</p> : null}
            <p className="text-xs text-muted">User provided. Not an official notice.</p>
            {report.mine ? null : (
              <div className="flex gap-2">
                <Form action={confirmFieldReportAction as FieldAction}>
                  <input type="hidden" name="id" value={report.id} />
                  <input type="hidden" name="agree" value="yes" />
                  <button className="btn" type="submit" disabled={!field.canWrite}>I see this too</button>
                </Form>
                <Form action={confirmFieldReportAction as FieldAction}>
                  <input type="hidden" name="id" value={report.id} />
                  <input type="hidden" name="agree" value="no" />
                  <button className="btn btn-ghost" type="submit" disabled={!field.canWrite}>Not there</button>
                </Form>
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="grid max-w-xl gap-4">
        <h2 className="text-2xl">Places drivers know</h2>
        <p className="text-sm text-muted">Trotro stations, taxi ranks, lorry stations, rural hubs, shops, and the other kinds below. There is no rating, menu, or open-now flag.</p>
        <Form action={submitCommunityPlaceAction as FieldAction}>
          <input type="hidden" name="lat" value={here?.lat ?? ""} />
          <input type="hidden" name="lng" value={here?.lng ?? ""} />
          <label className="grid gap-1 text-sm">Kind
            <select name="kind" className="rounded-[12px] border border-line bg-transparent px-3 py-2" defaultValue="trotro_station">
              {field.placeKinds.map((kind) => <option key={kind.id} value={kind.id}>{kind.group} · {kind.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Name
            <input name="name" required minLength={2} maxLength={60} className="rounded-[12px] border border-line bg-transparent px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm">Note
            <input name="note" maxLength={140} className="rounded-[12px] border border-line bg-transparent px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm">Phone, if you know it
            <input name="phone" maxLength={40} inputMode="tel" className="rounded-[12px] border border-line bg-transparent px-3 py-2" placeholder="Leave empty if you do not" />
          </label>
          <label className="grid gap-1 text-sm">Hours, as written
            <input name="hours" maxLength={80} className="rounded-[12px] border border-line bg-transparent px-3 py-2" placeholder="Not a live open or closed flag" />
          </label>
          <label className="grid gap-1 text-sm">Services, if you know them
            <input name="services" maxLength={80} className="rounded-[12px] border border-line bg-transparent px-3 py-2" placeholder="What a driver can ask for here" />
          </label>
          <button className="btn w-fit" type="submit" disabled={!field.canWrite || !here}>Add place</button>
        </Form>
        {field.openPlaces.map((place) => (
          <article key={place.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3">
            <div>
              <p className="font-medium">{place.name}</p>
              <p className="text-sm text-muted">{place.label} · {place.status} · User provided{place.phone ? ` · ${place.phone}` : ""}{place.hours ? ` · ${place.hours}` : ""}{place.services ? ` · ${place.services}` : ""}</p>
            </div>
            {place.mine ? (
              <Form action={editCommunityPlaceAction as FieldAction}>
                <input type="hidden" name="id" value={place.id} />
                <input name="name" required minLength={2} maxLength={60} defaultValue={place.name} aria-label={`Name for ${place.name}`} className="rounded-[12px] border border-line bg-transparent px-3 py-2" />
                <input name="phone" maxLength={40} defaultValue={place.phone} aria-label="Phone" className="rounded-[12px] border border-line bg-transparent px-3 py-2" />
                <input name="hours" maxLength={80} defaultValue={place.hours} aria-label="Hours" className="rounded-[12px] border border-line bg-transparent px-3 py-2" />
                <input name="services" maxLength={80} defaultValue={place.services} aria-label="Services" className="rounded-[12px] border border-line bg-transparent px-3 py-2" />
                <input name="note" maxLength={140} defaultValue={place.note} aria-label="Note" className="rounded-[12px] border border-line bg-transparent px-3 py-2" />
                <button className="btn" type="submit" disabled={!field.canWrite}>Save edits</button>
              </Form>
            ) : null}
            {place.mine ? null : (
              <Form action={reportCommunityPlaceAction as FieldAction}>
                <input type="hidden" name="id" value={place.id} />
                <select name="reason" aria-label={`Report ${place.name}`} className="rounded-[12px] border border-line bg-transparent px-3 py-2" defaultValue="gone">
                  <option value="gone">Not there</option>
                  <option value="wrong">Wrong</option>
                  <option value="offensive">Offensive</option>
                </select>
                <button className="btn btn-ghost" type="submit" disabled={!field.canWrite}>Report</button>
              </Form>
            )}
            {place.status === "confirmed" ? null : (
              <Form action={confirmCommunityPlaceAction as FieldAction}>
                <input type="hidden" name="id" value={place.id} />
                <button className="btn" type="submit" disabled={!field.canWrite}>Confirm</button>
              </Form>
            )}
          </article>
        ))}
        {field.places.length > 0 ? <p className="text-sm">{field.places.length} confirmed place{field.places.length === 1 ? "" : "s"} other drivers can see.</p> : null}
      </section>

      <section className="grid max-w-xl gap-4">
        <h2 className="text-2xl">A request</h2>
        <p className="text-sm text-muted">Sending a request does not change the app.</p>
        <Form action={submitAskAction as FieldAction}>
          <label className="grid gap-1 text-sm">Request
            <input name="text" required minLength={8} maxLength={140} className="rounded-[12px] border border-line bg-transparent px-3 py-2" />
          </label>
          <button className="btn w-fit" type="submit" disabled={!field.canWrite}>Send</button>
        </Form>
      </section>

      <section className="grid max-w-xl gap-4">
        <h2 className="text-2xl">Events, holidays, rain</h2>
        <p className="text-sm text-muted">A public holiday is kept apart from an ordinary day. Rain uses a drive you marked as rain.</p>
        <Form action={submitFieldEventAction as FieldAction}>
          <input type="hidden" name="lat" value={here?.lat ?? ""} />
          <input type="hidden" name="lng" value={here?.lng ?? ""} />
          <label className="grid gap-1 text-sm">Event name
            <input name="name" required minLength={2} maxLength={60} className="rounded-[12px] border border-line bg-transparent px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm">Starts
            <input name="startsAt" type="datetime-local" required className="rounded-[12px] border border-line bg-transparent px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm">Ends
            <input name="endsAt" type="datetime-local" required className="rounded-[12px] border border-line bg-transparent px-3 py-2" />
          </label>
          <button className="btn w-fit" type="submit" disabled={!field.canWrite || !here}>Save event</button>
        </Form>
        {field.events.map((event) => (
          <article key={event.id} className="flex items-center justify-between gap-3 border-t border-line py-3">
            <p>{event.name} · {event.status}</p>
            {event.status === "confirmed" ? null : (
              <Form action={confirmFieldEventAction as FieldAction}>
                <input type="hidden" name="id" value={event.id} />
                <button className="btn" type="submit" disabled={!field.canWrite}>Confirm</button>
              </Form>
            )}
          </article>
        ))}
      </section>

      <section className="grid gap-3">
        <h2 className="text-2xl">Partnerships</h2>
        <ul className="grid gap-2">
          {field.partners.map((slot) => (
            <li key={slot.sector} className="text-sm"><span className="font-medium">{slot.sector}.</span> Not connected. {slot.note}</li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3">
        <h2 className="text-2xl">What can earn</h2>
        <ul className="grid gap-2">
          {field.revenue.map((item) => (
            <li key={item.name} className="text-sm"><span className="font-medium">{item.name}.</span> {item.state === "not_connected" ? "Not connected. " : item.state === "partial" ? "Partial. " : ""}{item.detail}</li>
          ))}
        </ul>
      </section>

      <p className="max-w-xl text-sm text-muted">Nothing here reorders a route, and a route is never planned around enforcement.</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <article className="card px-4 py-4">
      <p className="numeric text-4xl">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </article>
  );
}

function Form({ action, children }: { action: FieldAction; children: React.ReactNode }) {
  const [state, run] = useActionState(action, { error: "" });
  return (
    <form action={run} className="grid gap-3">
      {children}
      {state.error ? <p className="text-sm text-bad" role="alert">{state.error}</p> : null}
    </form>
  );
}
