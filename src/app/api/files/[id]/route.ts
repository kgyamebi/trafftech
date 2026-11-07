import { readFileSync, existsSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getSession } from "@/server/session";
import { dataDir, readDatabase } from "@/server/store";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.uid || session.mode !== "user") {
    return NextResponse.json({ error: "Sign in to open documents." }, { status: 401 });
  }
  const { id } = await context.params;
  const db = readDatabase();
  const doc = db.documents.find((d) => d.id === id && d.userId === session.uid && d.storedName);
  const evidence = db.evidence.find((e) => e.id === id && e.userId === session.uid && e.storedName);
  const storedName = doc?.storedName ?? evidence?.storedName;
  const mime = doc?.mime ?? evidence?.mime ?? "application/octet-stream";
  const downloadName = doc?.fileName ?? evidence?.fileName ?? "file";
  if (!storedName || storedName.includes("..") || storedName.includes("/") || storedName.includes("\\")) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
  const full = path.join(dataDir(), "uploads", session.uid, storedName);
  if (!existsSync(full)) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const bytes = readFileSync(full);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="${downloadName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
