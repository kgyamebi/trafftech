"use server";

import { randomUUID } from "crypto";
import { z, ZodError } from "zod";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { analyzeContest } from "@/domain/ai";
import { parseDrivePrefs } from "@/domain/drive-prefs";
import { isEvasionRequest } from "@/domain/inbox";
import { cleanText } from "@/domain/clean";
import type { AIAnswer, NotificationPrefs, PlanId } from "@/domain/types";
import {
  AccountError,
  addDocument,
  addFleetDriver,
  addVehicle,
  attachFile,
  authenticate,
  completeOnboarding,
  createFleet,
  deleteDrivingSession,
  deletePlace,
  deleteExpense,
  deleteUser,
  exportUser,
  saveEmergency,
  saveExpense,
  importViolation,
  recordPayment,
  requestPlan,
  saveDrivingSession,
  savePlace,
  signup,
} from "./accounts";
import { answerWithProvider } from "./ai-provider";
import { rateLimit } from "./rate-limit";
import { clearSession, getSession, setSession } from "./session";
import { dataDir, updateDatabase } from "./store";
import { loadWorkspace } from "./workspace";

function dir() {
  return dataDir();
}

async function clientKey() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
}

async function userId(): Promise<string> {
  const session = await getSession();
  if (session?.mode === "demo") throw new AccountError("Demo data is read-only. Create an account to keep your own records.");
  if (!session?.uid) redirect("/login");
  return session.uid;
}

function rethrowRedirect(error: unknown): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
  ) {
    throw error;
  }
}

function fail(error: unknown): { ok: false; error: string } {
  if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message ?? "Check the form." };
  if (error instanceof AccountError) return { ok: false, error: error.message };
  return { ok: false, error: "Something went wrong. Your records are still here." };
}

export async function signupAction(_prev: { error: string }, formData: FormData) {
  if (!rateLimit(`signup:${await clientKey()}`, 8, 15 * 60_000)) {
    return { error: "Too many attempts. Wait a little, then try again." };
  }
  try {
    const user = await signup(dir(), {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    await setSession({ mode: "user", uid: user.id });
  } catch (error) {
    return fail(error).ok === false ? { error: fail(error).error } : { error: "Could not create the account." };
  }
  redirect("/onboarding");
}

export async function loginAction(_prev: { error: string }, formData: FormData) {
  if (!rateLimit(`login:${await clientKey()}`, 10, 15 * 60_000)) {
    return { error: "Too many attempts. Wait a little, then try again." };
  }
  try {
    const user = await authenticate(dir(), String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
    await setSession({ mode: "user", uid: user.id });
    redirect(user.onboardingCompleted ? "/home" : "/onboarding");
  } catch (error) {
    rethrowRedirect(error);
    return { error: error instanceof AccountError ? error.message : "Could not sign in." };
  }
}

export async function logoutAction() {
  await clearSession();
  redirect("/");
}

export async function startDemoAction() {
  await setSession({ mode: "demo" });
  redirect("/home");
}

export async function exitDemoAction() {
  await clearSession();
  redirect("/");
}

export async function completeOnboardingAction() {
  const session = await getSession();
  if (session?.mode === "demo") redirect("/home");
  const uid = await userId();
  await completeOnboarding(dir(), uid);
  redirect("/home");
}

export async function createVehicleAction(_prev: { error: string }, formData: FormData) {
  try {
    const uid = await userId();
    const vehicle = await addVehicle(dir(), uid, {
      plate: String(formData.get("plate") ?? ""),
      make: String(formData.get("make") ?? ""),
      model: String(formData.get("model") ?? ""),
      year: String(formData.get("year") ?? ""),
      colour: String(formData.get("colour") ?? ""),
    });
    const kinds = ["insurance", "roadworthiness", "registration", "licence"] as const;
    for (const kind of kinds) {
      const date = String(formData.get(kind) ?? "");
      if (!date) continue;
      await addDocument(dir(), uid, {
        vehicleId: kind === "licence" ? null : vehicle.id,
        kind,
        label: kind === "licence" ? "Driver licence" : kind[0].toUpperCase() + kind.slice(1),
        expiresOn: date,
        note: "",
      });
    }
    revalidatePath("/home");
  } catch (error) {
    rethrowRedirect(error);
    return { error: error instanceof AccountError ? error.message : "Could not save the vehicle." };
  }
  redirect("/vehicle");
}

export async function selectVehicleAction(formData: FormData) {
  const uid = await userId();
  const vehicleId = String(formData.get("vehicleId") ?? "");
  await updateDatabase(dir(), (db) => {
    const user = db.users.find((u) => u.id === uid);
    if (!user || !db.vehicles.some((v) => v.id === vehicleId && v.userId === uid)) return;
    user.activeVehicleId = vehicleId;
  });
  revalidatePath("/home");
}

export async function saveDocumentAction(_prev: { error: string }, formData: FormData) {
  try {
    const uid = await userId();
    const doc = await addDocument(dir(), uid, {
      vehicleId: String(formData.get("vehicleId") ?? "") || null,
      kind: String(formData.get("kind") ?? "other") as "other",
      label: String(formData.get("label") ?? ""),
      expiresOn: String(formData.get("expiresOn") ?? ""),
      note: String(formData.get("note") ?? ""),
    });
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      const bytes = Buffer.from(await file.arrayBuffer());
      await attachFile(dir(), uid, doc.id, { name: file.name, type: file.type, bytes });
    }
    revalidatePath("/documents");
    return { error: "" };
  } catch (error) {
    return { error: error instanceof AccountError ? error.message : "Could not save the document." };
  }
}

export async function importNoticeAction(_prev: { error: string }, formData: FormData) {
  try {
    const uid = await userId();
    const result = await importViolation(dir(), uid, {
      raw: String(formData.get("raw") ?? ""),
      vehicleId: String(formData.get("vehicleId") ?? "") || null,
      deadline: String(formData.get("deadline") ?? ""),
      confirmDeadline: formData.get("confirmDeadline") === "on",
    });
    revalidatePath("/traffic");
    redirect(`/traffic/${result.violation.id}`);
  } catch (error) {
    rethrowRedirect(error);
    return { error: error instanceof AccountError ? error.message : "Could not import that message." };
  }
}

export async function recordPaymentAction(_prev: { error: string }, formData: FormData) {
  try {
    const uid = await userId();
    await recordPayment(dir(), uid, {
      violationId: String(formData.get("violationId") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      paidOn: String(formData.get("paidOn") ?? ""),
      reference: String(formData.get("reference") ?? ""),
    });
    revalidatePath("/traffic");
    return { error: "" };
  } catch (error) {
    return { error: error instanceof AccountError ? error.message : "Could not record the payment." };
  }
}

export async function saveSessionAction(payload: {
  vehicleId: string | null;
  startedAt: string;
  endedAt: string;
  roadContext: string;
  samples: { t: string; speedKph: number; limitKph: number }[];
  harshBrakes: number;
  harshAccelerations: number;
  originLabel?: string;
  destinationLabel?: string;
  distanceM?: number;
  geometry?: { lat: number; lng: number }[];
  notes?: string[];
}) {
  try {
    const uid = await userId();
    const row = await saveDrivingSession(dir(), uid, { ...payload, driverId: null });
    revalidatePath("/score");
    revalidatePath("/drive");
    return { ok: true as const, error: "", id: row.id };
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false as const, error: error instanceof AccountError ? error.message : "Could not save the drive.", id: "" };
  }
}

export async function deleteSessionAction(sessionId: string) {
  try {
    const uid = await userId();
    await deleteDrivingSession(dir(), uid, sessionId);
    revalidatePath("/drive");
    revalidatePath("/score");
    return { ok: true as const, error: "" };
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false as const, error: error instanceof AccountError ? error.message : "Could not remove the trip." };
  }
}

const placeSchema = z.object({
  slot: z.enum(["home", "work", "school", "favourite"]),
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().max(160),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

export async function savePlaceAction(payload: z.infer<typeof placeSchema>) {
  try {
    const uid = await userId();
    const input = placeSchema.parse(payload);
    await savePlace(dir(), uid, input);
    revalidatePath("/drive");
    return { ok: true as const, error: "" };
  } catch (error) {
    rethrowRedirect(error);
    return fail(error);
  }
}

export async function deletePlaceAction(placeId: string) {
  try {
    const uid = await userId();
    await deletePlace(dir(), uid, placeId);
    revalidatePath("/drive");
    return { ok: true as const, error: "" };
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false as const, error: error instanceof AccountError ? error.message : "Could not remove the place." };
  }
}

export async function createFleetAction(_prev: { error: string }, formData: FormData) {
  try {
    const uid = await userId();
    await createFleet(dir(), uid, String(formData.get("name") ?? ""));
    revalidatePath("/fleet");
    return { error: "" };
  } catch (error) {
    return { error: error instanceof AccountError ? error.message : "Could not create the fleet." };
  }
}

export async function addDriverAction(_prev: { error: string }, formData: FormData) {
  try {
    const uid = await userId();
    await addFleetDriver(dir(), uid, {
      name: String(formData.get("name") ?? ""),
      plate: String(formData.get("plate") ?? ""),
      vehicleLabel: String(formData.get("vehicleLabel") ?? ""),
    });
    revalidatePath("/fleet");
    return { error: "" };
  } catch (error) {
    return { error: error instanceof AccountError ? error.message : "Could not add the driver." };
  }
}

export async function requestPlanAction(formData: FormData) {
  const uid = await userId();
  const plan = String(formData.get("plan") ?? "free") as PlanId;
  await requestPlan(dir(), uid, plan);
  revalidatePath("/settings/subscription");
}

export async function savePrefsAction(formData: FormData) {
  const uid = await userId();
  const prefs: NotificationPrefs = {
    positive: formData.get("positive") === "on",
    information: formData.get("information") === "on",
    important: formData.get("important") === "on",
    traffic: formData.get("traffic") === "on",
    vehicle: formData.get("vehicle") === "on",
    safety: formData.get("safety") === "on",
    system: formData.get("system") === "on",
  };
  await updateDatabase(dir(), (db) => {
    const user = db.users.find((u) => u.id === uid);
    if (user) user.prefs = prefs;
  });
  revalidatePath("/notifications");
}

export async function markNotificationAction(formData: FormData) {
  const uid = await userId();
  const id = String(formData.get("id") ?? "");
  const op = String(formData.get("op") ?? "read");
  await updateDatabase(dir(), (db) => {
    let row = db.reads.find((r) => r.userId === uid && r.id === id);
    if (!row) {
      row = { userId: uid, id, readAt: null, archivedAt: null };
      db.reads.push(row);
    }
    const now = new Date().toISOString();
    if (op === "archive") row.archivedAt = now;
    else row.readAt = now;
  });
  revalidatePath("/notifications");
}

export async function saveTransferAction(_prev: { error: string }, formData: FormData) {
  try {
    const uid = await userId();
    const vehicleId = String(formData.get("vehicleId") ?? "");
    await updateDatabase(dir(), (db) => {
      if (!db.vehicles.some((v) => v.id === vehicleId && v.userId === uid)) throw new AccountError("Vehicle not found.");
      const existing = db.transfers.find((t) => t.vehicleId === vehicleId && t.userId === uid);
      const next = {
        id: existing?.id ?? randomUUID(),
        userId: uid,
        vehicleId,
        sold: formData.get("sold") === "on",
        saleDate: String(formData.get("saleDate") ?? "").slice(0, 10) || null,
        buyerName: cleanText(formData.get("buyerName"), 80),
        buyerPhone: cleanText(formData.get("buyerPhone"), 20),
        notes: cleanText(formData.get("notes"), 600),
        ownershipUpdate: (String(formData.get("ownershipUpdate") ?? "not_started") ||
          "not_started") as "unknown" | "user_says_submitted" | "not_started",
        updatedAt: new Date().toISOString(),
      };
      if (existing) Object.assign(existing, next);
      else db.transfers.push(next);
    });
    revalidatePath("/vehicle");
    return { error: "" };
  } catch (error) {
    return { error: error instanceof AccountError ? error.message : "Could not save the checklist." };
  }
}

export async function contestAction(_prev: { error: string; answer: AIAnswer | null }, formData: FormData) {
  try {
    const uid = await userId();
    const ws = await loadWorkspace();
    if (!ws.entitlements.ai && ws.mode !== "demo") {
      return {
        error: "Contest notes with Driver Intelligence are part of Pro. You can still keep your own written notes on Pro, and the public contest steps stay on the notice.",
        answer: null,
      };
    }
    const violationId = String(formData.get("violationId") ?? "");
    const notes = cleanText(formData.get("notes"), 2000);
    const violation = ws.violations.find((v) => v.id === violationId);
    const analysis = analyzeContest(violation, notes);
    if (ws.mode === "user") {
      await updateDatabase(dir(), (db) => {
        db.contests.push({
          id: randomUUID(),
          userId: uid,
          violationId,
          userNotes: notes,
          createdAt: new Date().toISOString(),
          status: "preparing",
          analysis,
        });
        const row = db.violations.find((v) => v.id === violationId && v.userId === uid);
        if (row && row.status === "action_required") row.status = "contest_in_preparation";
      });
    }
    revalidatePath("/traffic");
    return { error: "", answer: analysis };
  } catch (error) {
    return { error: error instanceof AccountError ? error.message : "Could not prepare the notes.", answer: null };
  }
}

export async function askAction(_prev: { error: string; answer: AIAnswer | null }, formData: FormData) {
  try {
    const question = cleanText(formData.get("question"), 500);
    if (!question) return { error: "Ask a question about your records.", answer: null };
    const ws = await loadWorkspace();
    if (isEvasionRequest(question)) {
      const answer = await answerWithProvider(ws, question);
      return { error: "", answer };
    }
    if (!ws.entitlements.ai) {
      return {
        error: "",
        answer: {
          title: "Pro keeps the conversation",
          confidenceNote: "No model was called.",
          refused: false,
          provider: "local" as const,
          sections: [
            {
              kind: "FACT" as const,
              heading: "What stays free",
              body: "Your score breakdown, documents and notices are already on their own screens. They are calculations and records, not a chat.",
            },
            {
              kind: "RECOMMENDATION" as const,
              heading: "Ask Driver Intelligence",
              body: "The conversational layer is part of Pro. Requesting Pro does not charge you. Payment collection is not connected.",
            },
          ],
        },
      };
    }
    const answer = await answerWithProvider(ws, question);
    if (ws.mode === "user") {
      const uid = await userId();
      await updateDatabase(dir(), (db) => {
        db.questions.push({ id: randomUUID(), userId: uid, question, answer, createdAt: new Date().toISOString() });
        db.questions = db.questions.filter((q) => q.userId !== uid).concat(db.questions.filter((q) => q.userId === uid).slice(-20));
      });
    }
    return { error: "", answer };
  } catch (error) {
    return { error: error instanceof AccountError ? error.message : "Could not answer that.", answer: null };
  }
}

export async function exportAction() {
  const uid = await userId();
  const data = await exportUser(dir(), uid);
  return JSON.stringify(data, null, 2);
}

export async function saveDrivePrefsAction(formData: FormData) {
  const prefs = parseDrivePrefs(JSON.stringify({
    simple: formData.get("simple") === "on",
    easy: formData.get("easy") === "on",
    lang: String(formData.get("lang") ?? "en"),
    voice: String(formData.get("voice") ?? "off"),
    role: String(formData.get("role") ?? "private"),
  }));
  const jar = await cookies();
  jar.set("nokware_drive", JSON.stringify(prefs), { httpOnly: false, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 400 });
  redirect(prefs.simple ? "/now" : "/settings");
}

export async function saveExpenseAction(_prev: { error: string }, formData: FormData): Promise<{ error: string }> {
  try {
    const uid = await userId();
    const ws = await loadWorkspace();
    await saveExpense(dir(), uid, {
      kind: String(formData.get("kind") ?? ""),
      amountGhs: Number(formData.get("amount") ?? ""),
      spentOn: String(formData.get("spentOn") ?? ""),
      note: cleanText(String(formData.get("note") ?? ""), 140),
      vehicleId: ws.activeVehicle?.id ?? null,
    });
    revalidatePath("/work");
    return { error: "" };
  } catch (error) {
    rethrowRedirect(error);
    return fail(error);
  }
}

export async function deleteExpenseAction(formData: FormData) {
  try {
    const uid = await userId();
    await deleteExpense(dir(), uid, String(formData.get("id") ?? ""));
    revalidatePath("/work");
  } catch (error) {
    rethrowRedirect(error);
  }
}

export async function saveEmergencyAction(_prev: { error: string }, formData: FormData): Promise<{ error: string }> {
  try {
    const uid = await userId();
    await saveEmergency(dir(), uid, {
      contactName: cleanText(String(formData.get("contactName") ?? ""), 80),
      contactPhone: cleanText(String(formData.get("contactPhone") ?? ""), 20),
      insurerName: cleanText(String(formData.get("insurerName") ?? ""), 80),
      insurerPhone: cleanText(String(formData.get("insurerPhone") ?? ""), 20),
      bloodGroup: cleanText(String(formData.get("bloodGroup") ?? ""), 8),
      medicalNote: cleanText(String(formData.get("medicalNote") ?? ""), 240),
    });
    revalidatePath("/emergency");
    revalidatePath("/now");
    return { error: "" };
  } catch (error) {
    rethrowRedirect(error);
    return fail(error);
  }
}

export async function deleteAccountAction() {
  const uid = await userId();
  await deleteUser(dir(), uid);
  await clearSession();
  redirect("/");
}
