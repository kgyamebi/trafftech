import { NextResponse } from "next/server";
import { exportUser } from "@/server/accounts";
import { getSession } from "@/server/session";
import { dataDir } from "@/server/store";

export async function GET() {
  const session = await getSession();
  if (!session?.uid || session.mode !== "user") {
    return NextResponse.json({ error: "Sign in to export your records." }, { status: 401 });
  }
  const data = await exportUser(dataDir(), session.uid);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": "attachment; filename=nokware-export.json",
      "Cache-Control": "private, no-store",
    },
  });
}
