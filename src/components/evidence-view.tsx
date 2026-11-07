import type { ViolationView } from "@/domain/types";
import { formatTime, formatWhen } from "@/domain/dates";
import { EmptyState, Source } from "./ui";

export function EvidenceView({ violation }: { violation: ViolationView | undefined }) {
  if (!violation) return <EmptyState title="Notice not found." body="There is nothing to show." />;
  const item = violation.evidence[0];
  if (!item) {
    return <EmptyState title="Evidence unavailable through connected sources." body="No photo, video or note is saved on this notice. Nokware cannot fetch the TraffiTech clip." />;
  }
  return (
    <article className="grid gap-6">
      <header>
        <p className="eyebrow">Evidence</p>
        <h1 className="display mt-3 text-5xl">{violation.title}</h1>
      </header>
      <div className="card grid min-h-64 place-items-center overflow-hidden bg-ink text-paper">
        {item.kind === "demo_illustration" ? <DemoArt /> : null}
        {item.url && item.mime?.startsWith("image/") ? (
          // User-supplied file. Remote patterns are not involved; the URL is our own API.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={item.note || "Evidence you uploaded"} className="max-h-[480px] w-full object-contain" />
        ) : null}
        {item.url && item.mime?.startsWith("video/") ? <video src={item.url} controls className="w-full" /> : null}
        {item.url && item.mime === "application/pdf" ? (
          <a className="btn btn-light" href={item.url}>Open the PDF you saved</a>
        ) : null}
        {item.kind === "note" ? <p className="max-w-md px-6 py-10 text-center">{item.note}</p> : null}
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <Row label="Recorded" value={item.capturedAt ? formatTime(item.capturedAt) : formatWhen(violation.occurredAt)} />
        <Row label="Location" value={violation.locationLabel || "Not entered"} />
        <Row label="Violation" value={violation.title} />
        <Row label="Recorded speed" value={violation.recordedSpeedKph != null ? `${violation.recordedSpeedKph} km/h` : "Not entered"} />
        <Row label="Applicable limit" value={violation.applicableLimitKph != null ? `${violation.applicableLimitKph} km/h` : "Not entered"} />
        <Row label="Source" value={item.source} />
      </dl>
      <p className="text-sm text-muted">{item.note}</p>
      <Source source={item.source} />
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-line pt-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}

function DemoArt() {
  return (
    <svg viewBox="0 0 640 360" className="w-full" role="img" aria-label="Demo illustration, not a photograph">
      <rect width="640" height="360" fill="#171812" />
      <path d="M40 250 H600" stroke="#f4f1ea" strokeOpacity="0.35" />
      <path d="M80 250 L160 190 H360 L430 250 Z" fill="none" stroke="#f4f1ea" strokeWidth="2" />
      <circle cx="190" cy="250" r="22" fill="none" stroke="#f4f1ea" />
      <circle cx="380" cy="250" r="22" fill="none" stroke="#f4f1ea" />
      <text x="40" y="70" fill="#f4f1ea" fontSize="18" fontFamily="Georgia, serif">DEMO · not a photograph</text>
      <text x="40" y="110" fill="#f4f1ea" fontSize="42" fontFamily="Georgia, serif">112 / 100</text>
    </svg>
  );
}
