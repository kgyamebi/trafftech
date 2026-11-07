"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDay, isCalendarDate } from "@/domain/dates";
import type { DocumentView } from "@/domain/types";
import { ResourceReader } from "./resource-reader";
import { Source, Status } from "./ui";

function attention(doc: DocumentView) {
  return doc.status === "expired" || doc.status === "expiring" || doc.status === "missing" || doc.status === "unknown";
}

export function DocumentsVault({ documents, canSave, tight = [] }: { documents: DocumentView[]; canSave: boolean; tight?: string[] }) {
  const [filter, setFilter] = useState<"all" | "attention" | "valid">("all");
  const [query, setQuery] = useState("");
  const counts = useMemo(() => ({
    attention: documents.filter(attention).length,
    valid: documents.filter((doc) => doc.status === "valid").length,
  }), [documents]);
  const shown = documents.filter((doc) => {
    if (filter === "attention" && !attention(doc)) return false;
    if (filter === "valid" && doc.status !== "valid") return false;
    const read = `${(doc.reading?.kept ?? []).join(" ")} ${(doc.reading?.fields ?? []).map((field) => field.value).join(" ")}`;
    const hay = `${doc.label} ${doc.kind} ${doc.note} ${read}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });
  return (
    <div className="grid gap-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Vault</p>
          <h1 className="display mt-3 text-5xl">Documents</h1>
        </div>
        <Link className="btn" href="/documents/new">Add</Link>
      </header>
      <ResourceReader canSave={canSave} tight={tight} />
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-[10px] border border-line px-3 py-2">{counts.attention} need attention</span>
        <span className="rounded-[10px] border border-line px-3 py-2">{counts.valid} in date</span>
      </div>
      <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a name or a note" aria-label="Search documents" />
      <div className="flex flex-wrap gap-2">
        {([
          ["all", "All"],
          ["attention", "Needs attention"],
          ["valid", "In date"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" className={filter === id ? "btn" : "btn btn-ghost"} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      {shown.length === 0 ? <p className="text-sm text-muted">{documents.length === 0 ? "Nothing saved yet." : "Nothing in this view."}</p> : (
        <ul className="grid gap-3">
          {shown.map((doc) => (
            <li key={doc.id} className="card px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">{doc.kind.replaceAll("_", " ")}</p>
                  <h2 className="mt-1 text-lg">{doc.label}</h2>
                  <p className="text-sm text-muted">
                    {doc.expiresOn ? `Expires ${formatDay(doc.expiresOn)}` : "No expiry entered"}
                    {doc.daysRemaining != null ? ` · ${doc.daysRemaining} days` : ""}
                    {` · Updated ${formatDay(doc.updatedAt.slice(0, 10))}`}
                  </p>
                </div>
                <Status tone={doc.status === "valid" ? "good" : doc.status === "expiring" ? "warn" : doc.status === "expired" || doc.status === "missing" ? "bad" : "info"}>
                  {doc.status === "unknown" ? "Date needed" : doc.status}
                </Status>
              </div>
              {doc.note.trim() ? <p className="mt-3 text-sm">Note saved for Driver Intelligence: {doc.note}</p> : <p className="mt-3 text-sm text-muted">No note yet.</p>}
              {doc.reading && (doc.reading.fields.length || doc.reading.kept.length) ? (
                <div className="mt-3">
                  {doc.reading.fields.map((field) => (
                    <p key={field.label} className="text-sm">{field.label}: {field.label === "Expiry" || field.label === "Issued" ? (isCalendarDate(field.value) ? formatDay(field.value) : field.value) : field.value}</p>
                  ))}
                </div>
              ) : null}
              <p className="mt-3 text-sm">{doc.verificationLabel}</p>
              <div className="mt-2"><Source source={doc.source} /></div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                {doc.hasFile ? <a className="underline" href={`/api/files/${doc.id}`}>Preview file</a> : null}
                <Link className="underline" href={`/ask?q=${encodeURIComponent(`What is the status of my ${doc.label}?`)}`}>Ask about this</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
