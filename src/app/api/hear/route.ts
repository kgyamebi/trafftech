import { NextResponse } from "next/server";
import { repairTranscript } from "@/domain/hearing";
import { rateLimit } from "@/server/rate-limit";
import { getSession } from "@/server/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "Sign in to send a voice note." }, { status: 401 });
  const key = session.uid ?? session.mode;
  if (!rateLimit(`hear:${key}`, 6, 60_000)) {
    return NextResponse.json({ ok: false, message: "Voice notes are a little busy. Wait a moment." }, { status: 429 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      ok: false,
      device: true,
      message: "Server transcription is not connected. This phone can listen instead.",
    });
  }
  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size < 800 || audio.size > 4_000_000) {
    return NextResponse.json({ ok: false, device: true, message: "That note was too short to send on." }, { status: 400 });
  }
  try {
    const upstream = new FormData();
    upstream.append("file", audio, audio.name || "note.webm");
    upstream.append("model", "whisper-1");
    upstream.append("prompt", "Nokware, Ghana. Insurance, roadworthiness, registration, licence, driver score, TraffiTech, Accra.");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: upstream,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      return NextResponse.json({ ok: false, device: true, message: "Transcription is temporarily unavailable." }, { status: 502 });
    }
    const json = (await response.json()) as { text?: string };
    const heard = repairTranscript(json.text ?? "");
    return NextResponse.json({
      ok: Boolean(heard.text),
      text: heard.text,
      confidence: heard.confidence,
      note: heard.confidence === "unclear"
        ? "That note did not settle into a question. Edit it, or say it again."
        : heard.note || "Heard, then read back before you send it.",
    });
  } catch {
    return NextResponse.json({ ok: false, device: true, message: "Transcription is temporarily unavailable." }, { status: 502 });
  }
}
