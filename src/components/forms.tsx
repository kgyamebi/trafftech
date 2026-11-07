"use client";

import { useActionState, useState } from "react";
import { kindLabel, readingSummary } from "@/domain/extract";
import { LANGUAGES } from "@/domain/drive-prefs";
import { parseTrafficMessage } from "@/domain/inbox";
import {
  addDriverAction,
  askAction,
  contestAction,
  createFleetAction,
  createVehicleAction,
  importNoticeAction,
  loginAction,
  recordPaymentAction,
  saveDocumentAction,
  saveEmergencyAction,
  saveExpenseAction,
  saveDrivePrefsAction,
  savePrefsAction,
  saveTransferAction,
  signupAction,
} from "@/server/actions";
import type { AIAnswer, NotificationPrefs, TransferRecord, Workspace } from "@/domain/types";
import { ResourceReader } from "./resource-reader";
import { ErrorNote } from "./ui";

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, { error: "" });
  return (
    <form action={action} className="grid gap-4">
      {state.error ? <ErrorNote title="Check the form" body={state.error} /> : null}
      <Field name="name" label="Name" autoComplete="name" />
      <Field name="email" label="Email" type="email" autoComplete="email" />
      <Field name="password" label="Password" type="password" autoComplete="new-password" />
      <button className="btn" disabled={pending} type="submit">
        {pending ? "Creating" : "Create account"}
      </button>
    </form>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: "" });
  return (
    <form action={action} className="grid gap-4">
      {state.error ? <ErrorNote title="Try again" body={state.error} /> : null}
      <Field name="email" label="Email" type="email" autoComplete="email" />
      <Field name="password" label="Password" type="password" autoComplete="current-password" />
      <button className="btn" disabled={pending} type="submit">
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}

export function VehicleForm({ locked }: { locked?: string }) {
  const [state, action, pending] = useActionState(createVehicleAction, { error: "" });
  return (
    <form action={action} className="grid gap-4">
      {locked ? <ErrorNote title="One vehicle on Free" body={locked} /> : null}
      {state.error ? <ErrorNote title="Could not save" body={state.error} /> : null}
      <Field name="plate" label="Plate" placeholder="GW 4821-24" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="make" label="Make" placeholder="Toyota" />
        <Field name="model" label="Model" placeholder="Corolla" />
        <Field name="year" label="Year" placeholder="2019" />
        <Field name="colour" label="Colour" placeholder="Silver" />
      </div>
      <p className="text-sm text-muted">Optional dates, as printed. Leave a blank if you do not have the document yet.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="insurance" label="Insurance expiry" type="date" />
        <Field name="roadworthiness" label="Roadworthiness expiry" type="date" />
        <Field name="registration" label="Registration expiry" type="date" />
        <Field name="licence" label="Driver licence expiry" type="date" />
      </div>
      <button className="btn" disabled={pending || Boolean(locked)} type="submit">
        Save vehicle
      </button>
    </form>
  );
}

const DOC_KINDS = ["insurance", "roadworthiness", "registration", "ownership", "licence", "sale_agreement", "other"] as const;

export function DocumentForm({
  ws,
  initial,
  tight = [],
}: {
  ws: Workspace;
  initial?: { kind?: string; label?: string; expiresOn?: string; note?: string; reading?: string };
  tight?: string[];
}) {
  const [state, action, pending] = useActionState(saveDocumentAction, { error: "" });
  const [kind, setKind] = useState<(typeof DOC_KINDS)[number]>(DOC_KINDS.includes(initial?.kind as (typeof DOC_KINDS)[number]) ? (initial?.kind as (typeof DOC_KINDS)[number]) : "insurance");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [expiresOn, setExpiresOn] = useState(/^\d{4}-\d{2}-\d{2}$/.test(initial?.expiresOn ?? "") ? initial?.expiresOn ?? "" : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [reading, setReading] = useState(initial?.reading ?? "");
  return (
    <form action={action} className="grid gap-4" encType="multipart/form-data">
      {state.error ? <ErrorNote title="Could not save" body={state.error} /> : null}
      <ResourceReader
        canSave
        inputName="file"
        tight={tight}
        onUse={(result, stored) => {
          if (result.suggestedKind && DOC_KINDS.includes(result.suggestedKind)) setKind(result.suggestedKind);
          setLabel((current) => current || kindLabel(result.suggestedKind));
          if (result.suggestedExpiry) setExpiresOn(result.suggestedExpiry);
          setNote((current) => current || readingSummary(result));
          setReading(stored);
        }}
      />
      <label className="label">
        Vehicle
        <select name="vehicleId" className="field" defaultValue={ws.activeVehicle?.id ?? ""}>
          <option value="">Driver, not a vehicle</option>
          {ws.vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.plate}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Kind
        <select name="kind" className="field" value={kind} onChange={(event) => setKind(event.target.value as (typeof DOC_KINDS)[number])}>
          {DOC_KINDS.map((k) => (
            <option key={k} value={k}>
              {k.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <Field name="label" label="Name" placeholder="Comprehensive insurance" value={label} onChange={(event) => setLabel(event.target.value)} />
      <Field name="expiresOn" label="Expiry" type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} />
      <label className="label">
        Note
        <textarea name="note" className="field" value={note} onChange={(event) => setNote(event.target.value)} placeholder="A note Driver Intelligence can read later. You can also let a file reading fill this." />
      </label>
      <input type="hidden" name="reading" value={reading} />
      <button className="btn" disabled={pending} type="submit">
        {pending ? "Saving" : "Save document"}
      </button>
    </form>
  );
}

export function InboxForm({ ws, preview }: { ws: Workspace; preview?: string }) {
  const [state, action, pending] = useActionState(importNoticeAction, { error: "" });
  const [raw, setRaw] = useState(preview ?? "");
  const parsed = raw.trim().length > 8 ? parseTrafficMessage(raw) : null;
  return (
    <form action={action} className="grid gap-4">
      {state?.error ? <ErrorNote title="Not imported" body={state.error} /> : null}
      <label className="label">
        Message
        <textarea name="raw" className="field" required value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Paste the SMS or letter" />
      </label>
      {parsed ? (
        <div className="card px-4 py-4 text-sm">
          <p className="eyebrow">{parsed.assessment === "suspicious" ? "Suspicious message" : "Reading · not verified"}</p>
          <p className="mt-2 text-lg">{parsed.title}</p>
          <p className="mt-1">{parsed.amountGhs != null ? `GH₵${parsed.amountGhs}` : "No amount found"} · {parsed.occurredOn ?? "No date found"} · {parsed.locationLabel || "No location found"}</p>
          <p className="mt-2 text-muted">{parsed.sourceNote}</p>
          <p className="mt-2 eyebrow">Source · user provided, after you save</p>
        </div>
      ) : null}
      <label className="label">
        Vehicle
        <select name="vehicleId" className="field" defaultValue={ws.activeVehicle?.id ?? ""}>
          <option value="">Not sure</option>
          {ws.vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.plate}
            </option>
          ))}
        </select>
      </label>
      <Field name="deadline" label="Deadline on the notice" type="date" />
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="confirmDeadline" className="mt-1 h-4 w-4" />
        I have read the date on the notice and I want Nokware to count down to it. A blank uses 14 days from the date in the text, which is the public TraffiTech window — only if you confirm.
      </label>
      <button className="btn" disabled={pending || ws.mode === "demo"} type="submit">
        {ws.mode === "demo" ? "Demo cannot import" : pending ? "Saving" : "Save as my record"}
      </button>
    </form>
  );
}

export function PaymentForm({ violationId, amount }: { violationId: string; amount: number | null }) {
  const [state, action, pending] = useActionState(recordPaymentAction, { error: "" });
  return (
    <form action={action} className="grid gap-4">
      {state.error ? <ErrorNote title="Not recorded" body={state.error} /> : null}
      <input type="hidden" name="violationId" value={violationId} />
      <Field name="amount" label="Amount you paid" defaultValue={amount ? String(amount) : ""} />
      <Field name="paidOn" label="Date" type="date" />
      <Field name="reference" label="Your reference" placeholder="Receipt or MoMo id" />
      <p className="text-xs text-muted">This marks the notice as paid by you. It is not a receipt from the Police or NIB.</p>
      <button className="btn" disabled={pending} type="submit">
        Record a payment I made elsewhere
      </button>
    </form>
  );
}

export function ContestForm({ violationId }: { violationId: string }) {
  const [state, action, pending] = useActionState(contestAction, { error: "", answer: null });
  return (
    <div className="grid gap-6">
      <form action={action} className="grid gap-4">
        <input type="hidden" name="violationId" value={violationId} />
        <label className="label">
          Your notes
          <textarea name="notes" className="field" placeholder="What you believe is wrong, and which papers you have" />
        </label>
        <button className="btn" disabled={pending} type="submit">
          {pending ? "Reading your notes" : "Prepare a case summary"}
        </button>
      </form>
      {state.error ? <ErrorNote title="Not prepared" body={state.error} /> : null}
      {state.answer ? <AnswerView answer={state.answer} /> : null}
    </div>
  );
}

export function AskForm({ initial }: { initial?: string }) {
  const [state, action, pending] = useActionState(askAction, { error: "", answer: null });
  return (
    <div className="grid gap-6">
      <form action={action} className="grid gap-4">
        <label className="label">
          Question
          <textarea name="question" className="field" defaultValue={initial} placeholder="Why did my score change?" />
        </label>
        <button className="btn" disabled={pending} type="submit">
          {pending ? "Reading your records" : "Ask"}
        </button>
      </form>
      {state.error ? <ErrorNote title="No answer" body={state.error} /> : null}
      {state.answer ? <AnswerView answer={state.answer} /> : null}
    </div>
  );
}

export function AnswerView({ answer }: { answer: AIAnswer }) {
  return (
    <article className="grid gap-5">
      <header>
        <p className="eyebrow">{answer.provider === "local" ? "On-device reading" : answer.provider}</p>
        <h2 className="display mt-2 text-4xl">{answer.title}</h2>
        <p className="mt-3 text-sm text-muted">{answer.confidenceNote}</p>
      </header>
      {answer.sections.map((section) => (
        <section key={section.heading} className="border-t border-line pt-4">
          <p className="eyebrow">{section.kind.replaceAll("_", " ")}</p>
          <h3 className="mt-2 text-lg">{section.heading}</h3>
          <p className="mt-2 max-w-prose text-[15px] leading-relaxed">{section.body}</p>
        </section>
      ))}
    </article>
  );
}

export function FleetCreateForm() {
  const [state, action, pending] = useActionState(createFleetAction, { error: "" });
  return (
    <form action={action} className="grid gap-4">
      {state.error ? <ErrorNote title="Fleet stays closed" body={state.error} /> : null}
      <Field name="name" label="Fleet name" placeholder="Mensah deliveries" />
      <button className="btn" disabled={pending} type="submit">
        Create fleet
      </button>
    </form>
  );
}

export function DriverForm() {
  const [state, action, pending] = useActionState(addDriverAction, { error: "" });
  return (
    <form action={action} className="grid gap-4">
      {state.error ? <ErrorNote title="Not added" body={state.error} /> : null}
      <Field name="name" label="Driver" />
      <Field name="plate" label="Plate" />
      <Field name="vehicleLabel" label="Vehicle" placeholder="Toyota Hiace" />
      <button className="btn" disabled={pending} type="submit">
        Add driver
      </button>
    </form>
  );
}

export function TransferForm({ vehicleId, transfer }: { vehicleId: string; transfer?: TransferRecord }) {
  const [state, action, pending] = useActionState(saveTransferAction, { error: "" });
  return (
    <form action={action} className="grid gap-4">
      {state.error ? <ErrorNote title="Not saved" body={state.error} /> : null}
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="sold" defaultChecked={transfer?.sold} /> Vehicle sold
      </label>
      <Field name="saleDate" label="Sale date" type="date" defaultValue={transfer?.saleDate ?? ""} />
      <Field name="buyerName" label="Buyer" defaultValue={transfer?.buyerName ?? ""} />
      <Field name="buyerPhone" label="Buyer phone" defaultValue={transfer?.buyerPhone ?? ""} />
      <label className="label">
        Ownership record
        <select name="ownershipUpdate" className="field" defaultValue={transfer?.ownershipUpdate ?? "not_started"}>
          <option value="not_started">Not started</option>
          <option value="unknown">I don’t know if DVLA has it</option>
          <option value="user_says_submitted">I submitted it myself, outside Nokware</option>
        </select>
      </label>
      <label className="label">
        Notes
        <textarea name="notes" className="field" defaultValue={transfer?.notes ?? ""} />
      </label>
      <button className="btn" disabled={pending} type="submit">
        Save checklist
      </button>
    </form>
  );
}

export function PrefsForm({ prefs }: { prefs: NotificationPrefs }) {
  const keys: (keyof NotificationPrefs)[] = ["important", "information", "positive", "traffic", "vehicle", "safety", "system"];
  return (
    <form action={savePrefsAction} className="grid gap-3">
      <p className="text-sm text-muted">Urgent notices stay on. They are the ones with a deadline or an expired document.</p>
      {keys.map((key) => (
        <label key={key} className="flex items-center gap-3 text-sm capitalize">
          <input type="checkbox" name={key} defaultChecked={prefs[key]} /> {key}
        </label>
      ))}
      <button className="btn mt-2" type="submit">
        Save preferences
      </button>
    </form>
  );
}

export function ExpenseForm({ locked }: { locked: boolean }) {
  const [state, action, pending] = useActionState(saveExpenseAction, { error: "" });
  return (
    <form action={action} className="grid gap-4">
      {locked ? <ErrorNote title="Demo is read-only" body="Create an account to keep fuel and repair costs." /> : null}
      {state.error ? <ErrorNote title="Could not save" body={state.error} /> : null}
      <label className="label">
        Type
        <select name="kind" className="field" defaultValue="fuel">
          <option value="fuel">Fuel</option>
          <option value="repair">Repair</option>
          <option value="maintenance">Maintenance</option>
          <option value="insurance">Insurance</option>
          <option value="roadworthiness">Roadworthiness</option>
          <option value="violation">Violation</option>
          <option value="tyres">Tyres</option>
          <option value="takings">Money in</option>
          <option value="other">Other</option>
        </select>
      </label>
      <Field name="amount" label="Cedis" type="number" min="1" step="0.01" inputMode="decimal" required />
      <Field name="spentOn" label="Date" type="date" required />
      <Field name="note" label="Note" />
      <button className="btn" disabled={pending || locked} type="submit">{pending ? "Saving" : "Save"}</button>
    </form>
  );
}

export function EmergencyForm({
  locked,
  values,
}: {
  locked: boolean;
  values: { contactName: string; contactPhone: string; insurerName: string; insurerPhone: string; bloodGroup: string; medicalNote: string };
}) {
  const [state, action, pending] = useActionState(saveEmergencyAction, { error: "" });
  return (
    <form action={action} className="grid gap-4">
      {locked ? <ErrorNote title="Demo is read-only" body="Create an account to save an emergency contact." /> : null}
      {state.error ? <ErrorNote title="Could not save" body={state.error} /> : null}
      <Field name="contactName" label="Emergency contact" defaultValue={values.contactName} autoComplete="name" />
      <Field name="contactPhone" label="Their phone" defaultValue={values.contactPhone} inputMode="tel" autoComplete="tel" />
      <Field name="insurerName" label="Insurer" defaultValue={values.insurerName} />
      <Field name="insurerPhone" label="Insurer phone" defaultValue={values.insurerPhone} inputMode="tel" />
      <Field name="bloodGroup" label="Blood group, optional" defaultValue={values.bloodGroup} />
      <label className="label">
        Medical note, optional
        <textarea name="medicalNote" className="field" defaultValue={values.medicalNote} maxLength={240} />
      </label>
      <p className="text-sm text-muted">You type this. Nokware does not check it with a hospital or an insurer.</p>
      <button className="btn" disabled={pending || locked} type="submit">{pending ? "Saving" : "Save card"}</button>
    </form>
  );
}

export function DrivePrefsForm({ prefs }: { prefs: import("@/domain/drive-prefs").DrivePrefs }) {
  return (
    <form action={saveDrivePrefsAction} className="grid gap-4">
      <label className="flex min-h-14 items-center justify-between gap-4">
        Open the driving screen first
        <input type="checkbox" name="simple" defaultChecked={prefs.simple} />
      </label>
      <label className="flex min-h-14 items-center justify-between gap-4">
        Easy words
        <input type="checkbox" name="easy" defaultChecked={prefs.easy} />
      </label>
      <label className="label">
        Language
        <select name="lang" className="field" defaultValue={prefs.lang}>
          {LANGUAGES.map((language) => (
            <option key={language.id} value={language.id}>{language.label}</option>
          ))}
        </select>
      </label>
      <label className="label">
        Voice
        <select name="voice" className="field" defaultValue={prefs.voice}>
          <option value="off">Off</option>
          <option value="on">On</option>
          <option value="important">Important only</option>
          <option value="navigation">Navigation only</option>
        </select>
      </label>
      <label className="label">
        How you drive
        <select name="role" className="field" defaultValue={prefs.role}>
          <option value="private">Private car</option>
          <option value="trotro">Trotro</option>
          <option value="taxi">Taxi</option>
          <option value="ride">Ride-hailing</option>
          <option value="truck">Truck</option>
          <option value="delivery">Delivery</option>
        </select>
      </label>
      <p className="text-sm text-muted">Twi: Maakye, Ɛte sɛn, Me ho yɛ. Hausa: Ina kwana, Lafiya lau. Ga: Ojekoo, Te oyɔɔ tɛŋŋ. Eʋegbe: Ŋdi, Ɛfoa, Me fo. The posted sign line stays English.</p>
      <button className="btn" type="submit">Save driving setup</button>
    </form>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="label">
      {label}
      <input className="field" {...props} />
    </label>
  );
}
