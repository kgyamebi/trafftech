import "server-only";
import { redirect } from "next/navigation";
import { assembleWorkspace } from "@/domain/assemble";
import { buildDemoWorkspace } from "@/domain/demo";
import type { Workspace } from "@/domain/types";
import { getSession } from "./session";
import { readDatabase } from "./store";

export async function loadWorkspace(): Promise<Workspace> {
  const session = await getSession();
  if (!session) redirect("/login");
  const now = new Date();
  if (session.mode === "demo") return buildDemoWorkspace(now);
  if (!session.uid) redirect("/login");
  const db = readDatabase();
  const user = db.users.find((u) => u.id === session.uid);
  if (!user) redirect("/login");
  const fleet = db.fleets.find((f) => f.ownerId === user.id) ?? null;
  return assembleWorkspace({
    now,
    mode: "user",
    user,
    vehicles: db.vehicles.filter((v) => v.userId === user.id),
    documents: db.documents.filter((d) => d.userId === user.id),
    violations: db.violations.filter((v) => v.userId === user.id),
    evidence: db.evidence.filter((e) => e.userId === user.id),
    payments: db.payments.filter((p) => p.userId === user.id),
    contests: db.contests.filter((c) => c.userId === user.id),
    sessions: db.sessions.filter((s) => s.userId === user.id),
    notifications: db.notifications.filter((n) => n.userId === user.id),
    reads: db.reads.filter((r) => r.userId === user.id),
    fleet,
    fleetDrivers: fleet ? db.fleetDrivers.filter((d) => d.fleetId === fleet.id) : [],
    transfers: db.transfers.filter((t) => t.userId === user.id),
    questions: db.questions.filter((q) => q.userId === user.id).slice(-12),
    places: (db.places ?? []).filter((p) => p.userId === user.id),
    expenses: (db.expenses ?? []).filter((row) => row.userId === user.id),
  });
}

export async function loadOptionalWorkspace(): Promise<Workspace | null> {
  const session = await getSession();
  if (!session) return null;
  return loadWorkspace();
}
