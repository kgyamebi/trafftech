import { Listen } from "./listen";
import { EmergencyForm } from "./forms";
import type { Workspace } from "@/domain/types";

export function EmergencyScreen({ ws }: { ws: Workspace }) {
  const card = ws.emergency;
  const speech = [
    `Driver ${card.driverName}.`,
    card.plate ? `Vehicle ${card.plate}.` : "No vehicle saved.",
    card.contactName ? `Emergency contact ${card.contactName}, ${card.contactPhone}.` : "No emergency contact saved.",
    card.insurerName ? `Insurer ${card.insurerName}, ${card.insurerPhone}.` : "",
    card.bloodGroup ? `Blood group entered, ${card.bloodGroup}.` : "",
    card.medicalNote,
  ].filter(Boolean).join(" ");
  return (
    <div className="grid max-w-xl gap-8">
      <header>
        <p className="eyebrow">Emergency</p>
        <h1 className="display mt-3 text-5xl">{card.driverName}</h1>
        <p className="mt-3 text-muted">One card. Your name, the vehicle, and anyone you choose to list. It is not sent to a hospital.</p>
        {ws.mode === "demo" ? <p className="mt-2 text-sm">DEMO. Not your records.</p> : null}
      </header>
      <dl className="grid gap-4 text-lg">
        <div>
          <dt className="text-sm text-muted">Vehicle</dt>
          <dd className="text-2xl">{card.plate ? `${card.plate}${card.vehicle ? ` · ${card.vehicle}` : ""}` : "No vehicle saved."}</dd>
        </div>
        <Phone label="Emergency contact" name={card.contactName} phone={card.contactPhone} />
        <Phone label="Insurer" name={card.insurerName} phone={card.insurerPhone} />
        <div>
          <dt className="text-sm text-muted">Blood group</dt>
          <dd>{card.bloodGroup || "Not entered"}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Medical note</dt>
          <dd>{card.medicalNote || "Not entered"}</dd>
        </div>
      </dl>
      <Listen text={speech} label="Listen" />
      <p className="text-sm text-muted">After you open this card, a copy stays on this phone so the driving screen can show it. The map itself is not stored for offline use.</p>
      <EmergencyForm locked={ws.mode === "demo"} values={card} />
    </div>
  );
}

function Phone({ label, name, phone }: { label: string; name: string; phone: string }) {
  const callable = phone.replace(/[^\d+]/g, "");
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-2xl">
        {name || "None saved"}
        {callable ? <> · <a className="underline" href={`tel:${callable}`}>{phone}</a></> : null}
      </dd>
    </div>
  );
}
