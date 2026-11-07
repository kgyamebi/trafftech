import { NextResponse } from "next/server";
import { textFromFile } from "@/domain/file-text";
import { MAX_UPLOAD_BYTES } from "@/domain/clean";
import { rateLimit } from "@/server/rate-limit";
import { getSession } from "@/server/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "Sign in to read a file." }, { status: 401 });
  const key = session.uid ?? session.mode;
  if (!rateLimit(`read:${key}`, 8, 60_000)) {
    return NextResponse.json({ ok: false, message: "File reading is a little busy. Wait a moment." }, { status: 429 });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ ok: false, message: "That file is empty or larger than 8 MB." }, { status: 400 });
  }
  if (file.type.startsWith("image/")) {
    return NextResponse.json({
      ok: false,
      device: true,
      message: "Photos are read on this phone, after the picture is enhanced.",
    });
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = textFromFile(bytes, file.name || "file", file.type || "");
    if (!text.trim()) {
      return NextResponse.json({
        ok: true,
        text: "",
        message: "No text layer in that file. Photograph the page, or paste the words.",
      });
    }
    return NextResponse.json({ ok: true, text });
  } catch {
    return NextResponse.json({ ok: false, message: "That file could not be opened." }, { status: 422 });
  }
}
