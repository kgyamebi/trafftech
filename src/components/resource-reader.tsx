"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDay } from "@/domain/dates";
import {
  kindLabel,
  needsAnotherPass,
  readingSummary,
  resourceKind,
  settleReadings,
  toStored,
  type Extraction,
  type ResourceKind,
} from "@/domain/extract";
import { applyPractice } from "@/domain/living";
import { frameFromVideo, imagePasses } from "./image-passes";

const ACCEPT = "image/*,video/mp4,video/webm,video/quicktime,audio/*,.pdf,.txt,.csv,.json,.docx,.xlsx,application/pdf,text/plain";

async function collect(file: File, kind: ResourceKind, onStatus: (line: string) => void): Promise<{ text: string; label: string }[]> {
  if (kind === "text" || kind === "sheet" && file.name.toLowerCase().endsWith(".csv")) {
    onStatus("Reading the text in the file.");
    return [{ text: await file.text(), label: kind === "sheet" ? "Spreadsheet" : "Text in the file" }];
  }
  if (kind === "pdf" || kind === "document" || kind === "sheet") {
    onStatus("Reading the text layer.");
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/read", { method: "POST", body });
    const json = (await response.json()) as { ok?: boolean; text?: string; message?: string };
    if (!response.ok || !json.ok) throw new Error(json.message || "That file could not be read.");
    if (!json.text?.trim()) throw new Error(json.message || "No text layer in that file. Photograph the page, or paste the words.");
    return [{ text: json.text, label: kind === "pdf" ? "Text layer" : "Document text" }];
  }
  if (kind === "audio") {
    onStatus("Transcribing the recording.");
    const body = new FormData();
    body.append("audio", file);
    const response = await fetch("/api/hear", { method: "POST", body });
    const json = (await response.json()) as { ok?: boolean; text?: string; message?: string; device?: boolean };
    if (!json.ok || !json.text?.trim()) throw new Error(json.message || "That recording could not be read. Paste the words instead.");
    return [{ text: json.text, label: "Transcript" }];
  }
  if (kind === "image" || kind === "video") {
    onStatus("Reading the document.");
    const source = kind === "video" ? await frameFromVideo(file) : file;
    const passes = await imagePasses(source);
    const tesseract = await import("tesseract.js");
    const worker = await tesseract.createWorker("eng").catch(() => null);
    if (!worker) throw new Error("The photo reader could not start on this phone. Paste the words, or type the expiry.");
    const readings: { text: string; label: string }[] = [];
    try {
      let latest = settleReadings([], kind);
      for (const pass of passes) {
        if (readings.length && !needsAnotherPass(latest, { minPasses: 2, maxPasses: 5 })) break;
        onStatus("Reading the document.");
        await worker.setParameters({ tessedit_pageseg_mode: tesseract.PSM.SINGLE_BLOCK });
        const recognised = await worker.recognize(pass.blob);
        readings.push({ text: recognised.data.text ?? "", label: pass.detail });
        latest = settleReadings(readings, kind);
      }
      if (needsAnotherPass(latest, { minPasses: 2, maxPasses: 5 }) && passes[1]) {
        onStatus("Reading the document.");
        await worker.setParameters({ tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT });
        const recognised = await worker.recognize(passes[1].blob);
        readings.push({ text: recognised.data.text ?? "", label: "Sparse text" });
      }
    } finally {
      await worker.terminate();
    }
    return readings;
  }
  onStatus("Trying the file as text.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.includes(0)) throw new Error("This file type is not one Nokware can read. Use a photo, PDF, Word or Excel file, a spreadsheet, or paste the words.");
  return [{ text: new TextDecoder().decode(bytes), label: "Text in the file" }];
}

export function ResourceReader({
  canSave,
  inputName,
  onUse,
  tight = [],
}: {
  canSave: boolean;
  inputName?: string;
  onUse?: (result: Extraction, stored: string) => void;
  tight?: string[];
}) {
  const router = useRouter();
  const run = useRef(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [readings, setReadings] = useState<{ text: string; label: string }[]>([]);
  const [result, setResult] = useState<Extraction | null>(null);
  const [resource, setResource] = useState<ResourceKind>("text");
  const busy = Boolean(status);

  function publish(next: { text: string; label: string }[], kind: ResourceKind) {
    setReadings(next);
    setResource(kind);
    setResult(applyPractice(settleReadings(next, kind), tight));
  }

  function readPaste(again: boolean) {
    const text = draft.trim();
    if (text.length < 2) return;
    setError("");
    const next = again && readings.length ? [...readings, { text, label: `Paste ${readings.length + 1}` }].slice(-5) : [{ text, label: "Pasted text" }];
    publish(next, "text");
  }

  async function onFile(file: File | null) {
    if (!file) return;
    const id = ++run.current;
    setError("");
    setResult(null);
    setReadings([]);
    const kind = resourceKind(file.name, file.type);
    setResource(kind);
    try {
      const next = await collect(file, kind, (line) => {
        if (run.current === id) setStatus(line);
      });
      if (run.current !== id) return;
      if (!next.length) {
        setError("Nothing could be read from that file.");
        return;
      }
      publish(next, kind === "video" ? "video" : kind);
    } catch (cause) {
      if (run.current !== id) return;
      const message = cause instanceof Error ? cause.message : "";
      const usable = message && message !== "video" && message !== "canvas" && message !== "blob";
      setError(usable ? message : kind === "image" ? "This phone could not open that image. Try a JPEG or PNG, or paste the words." : "That file could not be read on this phone.");
    } finally {
      if (run.current === id) setStatus("");
    }
  }

  function useReading() {
    if (!result || (!result.fields.length && !result.kept.length)) return;
    const stored = JSON.stringify(toStored(result));
    if (onUse) {
      onUse(result, stored);
      return;
    }
    if (!canSave) return;
    const params = new URLSearchParams();
    if (result.suggestedKind) params.set("kind", result.suggestedKind);
    if (result.suggestedExpiry) params.set("expiresOn", result.suggestedExpiry);
    params.set("label", kindLabel(result.suggestedKind));
    const summary = readingSummary(result);
    if (summary) params.set("note", summary);
    params.set("reading", stored);
    router.push(`/documents/new?${params.toString()}`);
  }

  return (
    <section className="card grid gap-4 px-5 py-5">
      <div>
        <p className="eyebrow">Read a file</p>
        <h2 className="mt-2 text-2xl">Add a document</h2>
        <p className="mt-2 text-sm text-muted">Add a photo or paste the words. It is accepted or turned down on its own.</p>
      </div>
      <label className="label">
        Photo, PDF or other file
        <input
          name={inputName}
          type="file"
          accept={ACCEPT}
          capture="environment"
          className="text-sm"
          onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <label className="label">
        Or paste the words
        <textarea className="field field-short" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Paste a certificate, a spreadsheet row, or the line with the expiry" aria-label="Paste the words on the document" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={busy || draft.trim().length < 2} onClick={() => readPaste(false)}>Read this</button>
        {result ? <button type="button" className="btn btn-ghost" disabled={busy || draft.trim().length < 2} onClick={() => readPaste(true)}>Read it again</button> : null}
      </div>
      {status ? <p className="text-sm" aria-live="polite">{status}</p> : null}
      {error ? <p className="text-sm">{error}</p> : null}
      {result ? <Reading result={result} /> : null}
      {result && (result.fields.length || result.kept.length) ? (
        canSave ? (
          <button type="button" className="btn" onClick={useReading}>{result.decision === "accepted" ? "Save this document" : "Save this decision"}</button>
        ) : (
          <p className="text-sm text-muted">This stays on this screen. Create an account to store it.</p>
        )
      ) : null}
    </section>
  );
}

function Reading({ result }: { result: Extraction }) {
  return (
    <div className="grid gap-3">
      <p className="text-lg">{result.decision === "accepted" ? "Accepted" : "Not accepted"}</p>
      {result.fields.length ? (
        <dl className="grid gap-2">
          {result.fields.map((field) => (
            <div key={field.key}>
              <dt className="eyebrow">{field.label}</dt>
              <dd className="text-lg">{field.key === "expires" || field.key === "issued" ? formatDay(field.value) : field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
