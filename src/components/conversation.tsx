"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import { repairTranscript } from "@/domain/hearing";
import type { AIAnswer } from "@/domain/types";
import { askAction } from "@/server/actions";
import { AnswerView } from "./forms";
import { speak } from "./speak";
import { VoiceChoice } from "./voice-choice";

interface HeardEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface Listener {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: HeardEvent) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function deviceListener(): (new () => Listener) | null {
  if (typeof window === "undefined") return null;
  const host = window as unknown as {
    SpeechRecognition?: new () => Listener;
    webkitSpeechRecognition?: new () => Listener;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

export function Conversation({
  initial,
  turns,
}: {
  initial?: string;
  turns: { id: string; question: string; answer: AIAnswer }[];
}) {
  const [state, action, pending] = useActionState(askAction, { error: "", answer: null as AIAnswer | null });
  const [draft, setDraft] = useState(initial ?? "");
  const [asked, setAsked] = useState("");
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState("");
  const session = useRef<{
    listener: Listener | null;
    media: MediaRecorder | null;
    stream: MediaStream | null;
    chunks: Blob[];
    device: string;
  } | null>(null);

  const fresh = Boolean(state.answer && asked && turns[turns.length - 1]?.question !== asked);
  const spoken = state.answer?.sections.map((section) => section.body).join(" ") ?? "";

  async function stopNote() {
    const current = session.current;
    session.current = null;
    setRecording(false);
    current?.listener?.stop();
    const blob = await new Promise<Blob | null>((resolve) => {
      const media = current?.media;
      if (!media || media.state === "inactive") {
        const chunks = current?.chunks ?? [];
        resolve(chunks.length ? new Blob(chunks, { type: "audio/webm" }) : null);
        return;
      }
      media.onstop = () => resolve(new Blob(current?.chunks ?? [], { type: media.mimeType || "audio/webm" }));
      media.stop();
    });
    current?.stream?.getTracks().forEach((track) => track.stop());
    let text = "";
    let note = "";
    if (blob && blob.size > 800) {
      const body = new FormData();
      body.set("audio", blob, "note.webm");
      try {
        const response = await fetch("/api/hear", { method: "POST", body });
        const json = (await response.json()) as { ok?: boolean; text?: string; note?: string; device?: boolean };
        if (json.ok && json.text) {
          text = json.text;
          note = json.note || "Heard, then read back before you send it.";
        }
      } catch {
        note = "";
      }
    }
    if (!text && current?.device) {
      const heard = repairTranscript(current.device);
      text = heard.text;
      note = heard.confidence === "unclear"
        ? "That note did not settle into a question. Edit it, or say it again."
        : `${heard.note || "Heard on this phone."} Edit a word if it is wrong. The reply is checked before it is shown.`;
    }
    if (!text) note = note || "No note was caught. Type the question, or try again closer to the microphone.";
    if (text) setDraft(text);
    setHint(note);
  }

  async function startNote() {
    const chunks: Blob[] = [];
    const box = { listener: null as Listener | null, media: null as MediaRecorder | null, stream: null as MediaStream | null, chunks, device: "" };
    session.current = box;
    const Ctor = deviceListener();
    if (Ctor) {
      const listener = new Ctor();
      listener.lang = "en-GH";
      listener.interimResults = false;
      listener.maxAlternatives = 1;
      listener.onresult = (event) => {
        box.device = event.results[0]?.[0]?.transcript ?? "";
      };
      listener.onerror = () => undefined;
      try {
        listener.start();
        box.listener = listener;
      } catch {
        box.listener = null;
      }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      box.stream = stream;
      const media = new MediaRecorder(stream);
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      media.start();
      box.media = media;
    } catch {
      box.media = null;
    }
    if (!box.listener && !box.media) {
      session.current = null;
      setHint("This phone cannot take a voice note in this browser. Type the question instead.");
      return;
    }
    setRecording(true);
    setHint("Listening. Tap stop when you are done. You can edit the words before you ask.");
    window.setTimeout(() => {
      if (session.current === box) void stopNote();
    }, 45000);
  }

  return (
    <div className="grid gap-8">
      <VoiceChoice />
      <div className="thread">
        {turns.map((turn) => (
          <article key={turn.id} className="grid gap-3">
            <p className="thread-user">{turn.question}</p>
            <AnswerView answer={turn.answer} />
          </article>
        ))}
        {fresh && state.answer ? (
          <article className="grid gap-3">
            <p className="thread-user">{asked}</p>
            <AnswerView answer={state.answer} />
            <button type="button" className="btn btn-ghost w-fit" onClick={() => speak(spoken)}>Listen</button>
          </article>
        ) : null}
      </div>
      <form
        action={(formData) => {
          setAsked(String(formData.get("question") ?? ""));
          action(formData);
        }}
        className="grid gap-4"
      >
        <label className="label">
          Say it however it comes out
          <textarea
            name="question"
            className="field field-short"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="my insurence expire yet?"
          />
        </label>
        {hint ? <p className="text-sm text-muted">{hint}</p> : null}
        {state.error ? <p className="text-sm text-bad">{state.error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={pending || recording} type="submit">{pending ? "Checking the reply" : "Ask"}</button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => (recording ? void stopNote() : void startNote())}
          >
            {recording ? "Stop note" : "Voice note"}
          </button>
        </div>
        <p className="text-xs text-muted">A reply is checked against your saved records before it is shown. An unclear note is not guessed into an answer. A connected model is used only when one is configured, and its draft has to pass the same check.</p>
      </form>
    </div>
  );
}
