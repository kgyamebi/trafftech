import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, service: "nokware", time: new Date().toISOString() });
}
