import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { accraToday, addDays, isCalendarDate } from "@/domain/dates";
import { countHarsh, inGhana } from "@/domain/navigation";
import { canAddVehicle } from "@/domain/entitlements";
import { parseTrafficMessage } from "@/domain/inbox";
import { allowedUpload, MAX_UPLOAD_BYTES, cleanText, emailSchema, nameSchema, passwordSchema, plateSchema, safeFileName } from "@/domain/clean";
import { acceptReading, kindOnReading, sealReading } from "@/domain/extract";
import { applyPracticeReading, rememberDateCorrection, tightIds } from "@/domain/living";
import { absorbDrive, fieldFromDatabase } from "@/domain/field";
import { defaultPrefs, type DrivingSessionRecord, type EmergencyDetails, type ExpenseKind, type PlanId, type SavedPlaceRecord, type UserRecord } from "@/domain/types";
import { hashPassword, verifyPassword } from "./crypto";
import { dataDir, readDatabase, updateDatabase } from "./store";

export class AccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountError";
  }
}

function id() {
  return randomUUID();
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function signup(dir: string, input: { name: string; email: string; password: string }) {
  const name = nameSchema.parse(input.name);
  const email = emailSchema.parse(input.email);
  const password = passwordSchema.parse(input.password);
  return updateDatabase(dir, (db) => {
    if (db.users.some((u) => u.email === email)) throw new AccountError("An account with that email already exists.");
    const user: UserRecord = {
      id: id(),
      email,
      name,
      role: adminEmails().includes(email) ? "admin" : "driver",
      plan: "free",
      planStatus: "active",
      onboardingCompleted: false,
      createdAt: new Date().toISOString(),
      activeVehicleId: null,
      dataClass: "REAL",
      prefs: defaultPrefs(),
    };
    const cred = hashPassword(password);
    db.users.push(user);
    db.credentials.push({ userId: user.id, ...cred });
    db.notifications.push({
      id: `welcome:${user.id}`,
      userId: user.id,
      category: "info",
      topic: "system",
      title: "Your profile is ready",
      body: "Add the vehicle you drive. Nokware does not fetch it from DVLA.",
      href: "/vehicle/new",
      createdAt: user.createdAt,
      source: "CALCULATED",
    });
    db.audit.push({ id: id(), at: user.createdAt, actorId: user.id, action: "signup", entity: "user", entityId: user.id });
    return user;
  });
}

export async function authenticate(dir: string, emailRaw: string, password: string) {
  const email = emailSchema.parse(emailRaw);
  const db = readDatabase(dir);
  const user = db.users.find((u) => u.email === email);
  const cred = user ? db.credentials.find((c) => c.userId === user.id) : undefined;
  if (!user || !cred || !verifyPassword(password, cred.salt, cred.hash)) {
    throw new AccountError("Email or password does not match.");
  }
  await updateDatabase(dir, (draft) => {
    draft.audit.push({
      id: id(),
      at: new Date().toISOString(),
      actorId: user.id,
      action: "login",
      entity: "user",
      entityId: user.id,
    });
  });
  return user;
}

export async function completeOnboarding(dir: string, userId: string) {
  await updateDatabase(dir, (db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new AccountError("Account not found.");
    user.onboardingCompleted = true;
    db.audit.push({
      id: id(),
      at: new Date().toISOString(),
      actorId: userId,
      action: "onboarding_completed",
      entity: "user",
      entityId: userId,
    });
  });
}

export async function addVehicle(
  dir: string,
  userId: string,
  input: { plate: string; make: string; model: string; year: string; colour: string },
) {
  const plate = plateSchema.parse(input.plate);
  const make = cleanText(input.make, 40);
  const model = cleanText(input.model, 40);
  const colour = cleanText(input.colour, 40);
  const year = input.year ? Number(input.year) : null;
  if (!make || !model) throw new AccountError("Enter the make and model.");
  if (year != null && (year < 1970 || year > new Date().getFullYear() + 1)) throw new AccountError("Check the year.");
  return updateDatabase(dir, (db) => {
    const user = requireUser(db, userId);
    const owned = db.vehicles.filter((v) => v.userId === userId);
    const effectivePlan = user.planStatus === "active" ? user.plan : "free";
    const gate = canAddVehicle(effectivePlan, owned.length);
    if (!gate.ok) throw new AccountError(gate.reason);
    const vehicle = {
      id: id(),
      userId,
      plate,
      make,
      model,
      year,
      colour,
      createdAt: new Date().toISOString(),
      dataClass: user.dataClass,
    };
    db.vehicles.push(vehicle);
    user.activeVehicleId = vehicle.id;
    db.audit.push({ id: id(), at: vehicle.createdAt, actorId: userId, action: "vehicle_created", entity: "vehicle", entityId: vehicle.id });
    return vehicle;
  });
}

export async function addDocument(
  dir: string,
  userId: string,
  input: {
    vehicleId: string | null;
    kind: "insurance" | "roadworthiness" | "registration" | "ownership" | "licence" | "sale_agreement" | "other";
    label: string;
    expiresOn: string;
    note: string;
    reading?: string | null;
  },
) {
  const label = cleanText(input.label, 80);
  if (!label) throw new AccountError("Name the document.");
  const typedExpiry = input.expiresOn ? input.expiresOn.slice(0, 10) : null;
  if (typedExpiry && !isCalendarDate(typedExpiry)) throw new AccountError("Use a real expiry date.");
  const parsed = acceptReading(input.reading ?? null);
  const sealed = parsed ? sealReading(parsed, { expiresOn: typedExpiry }) : null;
  const fileKind = sealed ? kindOnReading(sealed) : null;
  const fileExpiry = sealed?.fields.find((field) => field.label === "Expiry")?.value ?? "";
  return updateDatabase(dir, (db) => {
    requireUser(db, userId);
    if (sealed && sealed.reasons.some((reason) => /date entered/.test(reason))) {
      rememberDateCorrection(db, userId, fileKind ?? input.kind, new Date());
    }
    const reading = sealed ? applyPracticeReading(sealed, fileKind ?? input.kind, tightIds(db.lessons ?? [])) : null;
    const expiresOn = isCalendarDate(fileExpiry) ? fileExpiry : reading?.decision === "refused" ? null : typedExpiry;
    if (input.vehicleId && !db.vehicles.some((v) => v.id === input.vehicleId && v.userId === userId)) {
      throw new AccountError("That vehicle is not on this account.");
    }
    const doc = {
      id: id(),
      userId,
      vehicleId: input.vehicleId,
      kind: fileKind ?? input.kind,
      label,
      expiresOn,
      updatedAt: new Date().toISOString(),
      verification: reading ? (reading.decision === "accepted" ? "accepted" as const : "refused" as const) : "user_provided" as const,
      fileName: null,
      storedName: null,
      mime: null,
      note: cleanText(input.note, 400),
      reading,
      source: "USER_PROVIDED" as const,
      dataClass: "REAL" as const,
    };
    db.documents.push(doc);
    db.audit.push({ id: id(), at: doc.updatedAt, actorId: userId, action: "document_saved", entity: "document", entityId: doc.id });
    return doc;
  });
}

export async function attachFile(
  dir: string,
  userId: string,
  documentId: string,
  file: { name: string; type: string; bytes: Buffer },
) {
  if (!allowedUpload(file.name, file.type)) throw new AccountError("Use a photo, PDF, Word or Excel file, a spreadsheet, a text file, or a short audio or video clip.");
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw new AccountError("Files need to be under 8 MB.");
  const db = readDatabase(dir);
  const doc = db.documents.find((d) => d.id === documentId && d.userId === userId);
  if (!doc) throw new AccountError("Document not found.");
  const storedName = `${id()}-${safeFileName(file.name)}`;
  const folder = path.join(dataDir(dir), "uploads", userId);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, storedName), file.bytes);
  await updateDatabase(dir, (draft) => {
    const row = draft.documents.find((d) => d.id === documentId && d.userId === userId);
    if (!row) throw new AccountError("Document not found.");
    row.fileName = safeFileName(file.name);
    row.storedName = storedName;
    row.mime = file.type;
    row.updatedAt = new Date().toISOString();
    draft.audit.push({ id: id(), at: row.updatedAt, actorId: userId, action: "file_attached", entity: "document", entityId: documentId });
  });
}

export async function importViolation(
  dir: string,
  userId: string,
  input: {
    raw: string;
    vehicleId: string | null;
    deadline: string;
    confirmDeadline: boolean;
  },
) {
  const parsed = parseTrafficMessage(input.raw);
  if (input.raw.trim().length < 8) throw new AccountError("Paste the message you received.");
  const typedDeadline = input.deadline ? input.deadline.slice(0, 10) : null;
  if (typedDeadline && !isCalendarDate(typedDeadline)) throw new AccountError("Use a real date.");
  const deadline = typedDeadline ?? (parsed.occurredOn && isCalendarDate(parsed.occurredOn) ? addDays(parsed.occurredOn, 14) : null);
  return updateDatabase(dir, (db) => {
    requireUser(db, userId);
    if (input.vehicleId && !db.vehicles.some((v) => v.id === input.vehicleId && v.userId === userId)) {
      throw new AccountError("That vehicle is not on this account.");
    }
    const row = {
      id: id(),
      userId,
      vehicleId: input.vehicleId,
      kind: parsed.kind,
      title: parsed.title,
      occurredAt: parsed.occurredOn ? `${parsed.occurredOn}T12:00:00.000Z` : new Date().toISOString(),
      locationLabel: parsed.locationLabel,
      amountGhs: parsed.amountGhs,
      status: "action_required" as const,
      deadline,
      deadlineConfirmed: Boolean(input.confirmDeadline && deadline),
      recordedSpeedKph: parsed.recordedSpeedKph,
      applicableLimitKph: parsed.applicableLimitKph,
      source: "IMPORTED" as const,
      rawMessage: cleanText(input.raw, 2000),
      scamAssessment: parsed.assessment,
      ticketNumber: parsed.ticketNumber,
      dataClass: "REAL" as const,
    };
    db.violations.push(row);
    db.audit.push({ id: id(), at: new Date().toISOString(), actorId: userId, action: "violation_imported", entity: "violation", entityId: row.id });
    return { violation: row, parsed };
  });
}

export async function recordPayment(
  dir: string,
  userId: string,
  input: { violationId: string; amount: string; paidOn: string; reference: string },
) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new AccountError("Enter the amount you paid.");
  const paidOn = input.paidOn.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) throw new AccountError("Enter the date you paid.");
  return updateDatabase(dir, (db) => {
    const v = db.violations.find((row) => row.id === input.violationId && row.userId === userId);
    if (!v) throw new AccountError("Notice not found.");
    const payment = {
      id: id(),
      userId,
      violationId: v.id,
      amountGhs: amount,
      paidOn,
      reference: cleanText(input.reference, 80) || "No reference entered",
      note: "You recorded this payment. Nokware has not confirmed it with any authority.",
      source: "USER_PROVIDED" as const,
    };
    db.payments.push(payment);
    v.status = "paid_user_reported";
    db.audit.push({ id: id(), at: new Date().toISOString(), actorId: userId, action: "payment_recorded", entity: "payment", entityId: payment.id });
    return payment;
  });
}

function assertRecordedTrip(session: { samples: { t: string; speedKph: number; limitKph: number }[]; startedAt: string; endedAt: string; distanceM?: number }) {
  const start = Date.parse(session.startedAt);
  const end = Date.parse(session.endedAt);
  const minutes = (end - start) / 60_000;
  const speeds = session.samples.map((sample) => sample.speedKph);
  const limits = session.samples.map((sample) => sample.limitKph);
  const times = session.samples.map((sample) => Date.parse(sample.t));
  const distance = session.distanceM;
  const implied = distance != null && Number.isFinite(distance) && minutes >= 1 ? (distance / 1000) / (minutes / 60) : 0;
  const broken = !Number.isFinite(start) || !Number.isFinite(end) || end < start || minutes > 18 * 60
    || session.samples.length > 2000
    || speeds.some((speed) => speed < 0 || speed > 220)
    || limits.some((limit) => limit < 5 || limit > 140)
    || times.some((at) => !Number.isFinite(at) || at < start - 60_000 || at > end + 60_000)
    || implied > 220;
  if (broken) throw new AccountError("That trip could not be saved.");
}

export async function saveDrivingSession(dir: string, userId: string, session: Omit<DrivingSessionRecord, "id" | "userId" | "source" | "dataClass" | "simulated"> & { raining?: boolean }) {
  assertRecordedTrip(session);
  const counted = countHarsh(session.samples);
  const { raining = false, ...drive } = session;
  return updateDatabase(dir, (db) => {
    requireUser(db, userId);
    const geometry = (drive.geometry ?? [])
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      .slice(0, 40);
    const row: DrivingSessionRecord = {
      ...drive,
      id: id(),
      userId,
      driverId: null,
      simulated: false,
      source: "USER_PROVIDED",
      dataClass: "REAL",
      samples: drive.samples.slice(0, 2000),
      harshBrakes: counted.brakes,
      harshAccelerations: counted.accels,
      originLabel: drive.originLabel?.trim().slice(0, 80) || undefined,
      destinationLabel: drive.destinationLabel?.trim().slice(0, 80) || undefined,
      distanceM: drive.distanceM != null && Number.isFinite(drive.distanceM) ? Math.max(0, Math.round(drive.distanceM)) : undefined,
      geometry: geometry.length >= 2 ? geometry : undefined,
      notes: (drive.notes ?? []).map((note) => note.trim().slice(0, 140)).filter(Boolean).slice(0, 8),
      clientId: drive.clientId?.trim().slice(0, 80) || undefined,
    };
    if (row.clientId) {
      const already = db.sessions.find((session) => session.userId === userId && session.clientId === row.clientId);
      if (already) return already;
    }
    db.sessions.push(row);
    const moving = row.samples.map((sample) => sample.speedKph).filter((speed) => speed >= 5);
    absorbDrive(fieldFromDatabase(db), {
      sessionId: row.id,
      userId,
      at: row.endedAt,
      meanSpeedKph: moving.length ? moving.reduce((sum, speed) => sum + speed, 0) / moving.length : null,
      points: row.geometry ?? [],
      raining,
      simulated: false,
      demo: false,
    });
    db.audit.push({ id: id(), at: new Date().toISOString(), actorId: userId, action: "session_saved", entity: "session", entityId: row.id });
    return row;
  });
}

export async function deleteDrivingSession(dir: string, userId: string, sessionId: string) {
  await updateDatabase(dir, (db) => {
    requireUser(db, userId);
    const row = db.sessions.find((session) => session.id === sessionId && session.userId === userId);
    if (!row) throw new AccountError("That trip is not on this account.");
    db.sessions = db.sessions.filter((session) => session.id !== sessionId);
    db.audit.push({ id: id(), at: new Date().toISOString(), actorId: userId, action: "session_deleted", entity: "session", entityId: sessionId });
  });
}

export async function savePlace(
  dir: string,
  userId: string,
  input: { slot: SavedPlaceRecord["slot"]; name: string; address: string; lat: number; lng: number },
) {
  if (!inGhana({ lat: input.lat, lng: input.lng })) throw new AccountError("Saved places stay within Ghana.");
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) throw new AccountError("Name the place.");
  return updateDatabase(dir, (db) => {
    requireUser(db, userId);
    if (!Array.isArray(db.places)) db.places = [];
    if (input.slot !== "favourite") db.places = db.places.filter((place) => !(place.userId === userId && place.slot === input.slot));
    const favourites = db.places.filter((place) => place.userId === userId && place.slot === "favourite");
    if (input.slot === "favourite" && favourites.length >= 12) throw new AccountError("You can keep 12 favourite places.");
    const row: SavedPlaceRecord = {
      id: id(),
      userId,
      slot: input.slot,
      name,
      address: input.address.trim().slice(0, 160),
      lat: input.lat,
      lng: input.lng,
    };
    db.places.push(row);
    db.audit.push({ id: id(), at: new Date().toISOString(), actorId: userId, action: "place_saved", entity: "place", entityId: row.id });
    return row;
  });
}

export async function deletePlace(dir: string, userId: string, placeId: string) {
  await updateDatabase(dir, (db) => {
    requireUser(db, userId);
    const row = (db.places ?? []).find((place) => place.id === placeId && place.userId === userId);
    if (!row) throw new AccountError("That place is not on this account.");
    db.places = db.places.filter((place) => place.id !== placeId);
    db.audit.push({ id: id(), at: new Date().toISOString(), actorId: userId, action: "place_deleted", entity: "place", entityId: placeId });
  });
}

export async function requestPlan(dir: string, userId: string, plan: PlanId) {
  if (!["free", "pro", "fleet"].includes(plan)) throw new AccountError("Unknown plan.");
  await updateDatabase(dir, (db) => {
    const user = requireUser(db, userId);
    if (plan === "free") {
      user.plan = "free";
      user.planStatus = "active";
    } else {
      user.plan = plan;
      user.planStatus = "pending_checkout";
    }
    db.audit.push({ id: id(), at: new Date().toISOString(), actorId: userId, action: "plan_requested", entity: "subscription", entityId: plan });
  });
}

export async function createFleet(dir: string, userId: string, name: string) {
  const fleetName = cleanText(name, 60);
  if (fleetName.length < 2) throw new AccountError("Name the fleet.");
  return updateDatabase(dir, (db) => {
    const user = requireUser(db, userId);
    if (user.plan !== "fleet" || user.planStatus !== "active") {
      throw new AccountError("Fleet is a separate plan. Requesting it does not turn billing on, and the dashboard stays closed until a plan is active.");
    }
    if (db.fleets.some((f) => f.ownerId === userId)) throw new AccountError("This account already has a fleet.");
    const fleet = {
      id: id(),
      ownerId: userId,
      name: fleetName,
      createdAt: new Date().toISOString(),
      dataClass: "REAL" as const,
    };
    db.fleets.push(fleet);
    db.audit.push({ id: id(), at: fleet.createdAt, actorId: userId, action: "fleet_created", entity: "fleet", entityId: fleet.id });
    return fleet;
  });
}

export async function addFleetDriver(dir: string, userId: string, input: { name: string; plate: string; vehicleLabel: string }) {
  const name = cleanText(input.name, 80);
  const plate = plateSchema.parse(input.plate);
  const vehicleLabel = cleanText(input.vehicleLabel, 80);
  if (name.length < 2 || !vehicleLabel) throw new AccountError("Enter the driver and the vehicle.");
  return updateDatabase(dir, (db) => {
    const fleet = db.fleets.find((f) => f.ownerId === userId);
    if (!fleet) throw new AccountError("Create a fleet first.");
    const driver = {
      id: id(),
      fleetId: fleet.id,
      name,
      plate,
      vehicleLabel,
      linkedVehicleId: null,
      notes: "",
      createdAt: new Date().toISOString(),
      dataClass: "REAL" as const,
    };
    db.fleetDrivers.push(driver);
    db.audit.push({ id: id(), at: driver.createdAt, actorId: userId, action: "fleet_driver_added", entity: "fleet_driver", entityId: driver.id });
    return driver;
  });
}

export function suggestDeadline(occurredOn: string | null): string | null {
  if (!occurredOn) return null;
  return addDays(occurredOn, 14);
}

export function todayIso(now = new Date()): string {
  return accraToday(now);
}

function requireUser(db: ReturnType<typeof readDatabase>, userId: string) {
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new AccountError("Account not found.");
  return user;
}

export async function exportUser(dir: string, userId: string) {
  const db = readDatabase(dir);
  requireUser(db, userId);
  await updateDatabase(dir, (draft) => {
    draft.audit.push({ id: id(), at: new Date().toISOString(), actorId: userId, action: "export", entity: "user", entityId: userId });
  });
  return {
    user: db.users.find((u) => u.id === userId),
    vehicles: db.vehicles.filter((v) => v.userId === userId),
    documents: db.documents
      .filter((d) => d.userId === userId)
      .map((d) => ({ ...d, storedName: d.storedName ? "file-on-server" : null })),
    violations: db.violations.filter((v) => v.userId === userId),
    payments: db.payments.filter((p) => p.userId === userId),
    sessions: db.sessions.filter((s) => s.userId === userId).map((s) => ({ ...s, samples: s.samples.length, geometry: s.geometry?.length ?? 0 })),
    places: (db.places ?? []).filter((p) => p.userId === userId),
    expenses: (db.expenses ?? []).filter((row) => row.userId === userId),
    emergency: db.users.find((user) => user.id === userId)?.emergency ?? null,
    note: "Speed samples are counted, not copied in full, and a route is stored only as a point count. Passwords are never exported.",
  };
}

const EXPENSE_KINDS: ExpenseKind[] = ["fuel", "repair", "maintenance", "insurance", "roadworthiness", "violation", "tyres", "other", "takings"];

export async function saveExpense(
  dir: string,
  userId: string,
  input: { kind: string; amountGhs: number; spentOn: string; note: string; vehicleId: string | null },
) {
  if (!EXPENSE_KINDS.includes(input.kind as ExpenseKind)) throw new AccountError("Choose a cost type.");
  if (!Number.isFinite(input.amountGhs) || input.amountGhs <= 0 || input.amountGhs > 1_000_000) throw new AccountError("Enter an amount in cedis.");
  if (!isCalendarDate(input.spentOn)) throw new AccountError("Enter the date.");
  const kind = input.kind as ExpenseKind;
  return updateDatabase(dir, (db) => {
    requireUser(db, userId);
    if (!Array.isArray(db.expenses)) db.expenses = [];
    const row = {
      id: id(),
      userId,
      vehicleId: input.vehicleId,
      kind,
      direction: kind === "takings" ? "in" as const : "out" as const,
      amountGhs: Math.round(input.amountGhs * 100) / 100,
      spentOn: input.spentOn,
      note: input.note.trim().slice(0, 140),
      source: "USER_PROVIDED" as const,
    };
    db.expenses.push(row);
    db.audit.push({ id: id(), at: new Date().toISOString(), actorId: userId, action: "expense_saved", entity: "expense", entityId: row.id });
    return row.id;
  });
}

export async function deleteExpense(dir: string, userId: string, expenseId: string) {
  await updateDatabase(dir, (db) => {
    requireUser(db, userId);
    const row = (db.expenses ?? []).find((item) => item.id === expenseId && item.userId === userId);
    if (!row) throw new AccountError("That cost is not on this account.");
    db.expenses = db.expenses.filter((item) => item.id !== expenseId);
    db.audit.push({ id: id(), at: new Date().toISOString(), actorId: userId, action: "expense_deleted", entity: "expense", entityId: expenseId });
  });
}

export async function saveEmergency(dir: string, userId: string, input: EmergencyDetails) {
  const clean = (value: string, max: number) => value.trim().slice(0, max);
  const details: EmergencyDetails = {
    contactName: clean(input.contactName, 80),
    contactPhone: clean(input.contactPhone, 20),
    insurerName: clean(input.insurerName, 80),
    insurerPhone: clean(input.insurerPhone, 20),
    bloodGroup: clean(input.bloodGroup, 8),
    medicalNote: clean(input.medicalNote, 240),
  };
  await updateDatabase(dir, (db) => {
    const user = requireUser(db, userId);
    user.emergency = details;
    db.audit.push({ id: id(), at: new Date().toISOString(), actorId: userId, action: "emergency_saved", entity: "user", entityId: userId });
  });
}

export async function deleteUser(dir: string, userId: string) {
  await updateDatabase(dir, (db) => {
    db.users = db.users.filter((u) => u.id !== userId);
    db.credentials = db.credentials.filter((c) => c.userId !== userId);
    db.vehicles = db.vehicles.filter((v) => v.userId !== userId);
    db.documents = db.documents.filter((d) => d.userId !== userId);
    db.violations = db.violations.filter((v) => v.userId !== userId);
    db.evidence = db.evidence.filter((e) => e.userId !== userId);
    db.payments = db.payments.filter((p) => p.userId !== userId);
    db.contests = db.contests.filter((c) => c.userId !== userId);
    db.sessions = db.sessions.filter((s) => s.userId !== userId);
    db.notifications = db.notifications.filter((n) => n.userId !== userId);
    db.reads = db.reads.filter((r) => r.userId !== userId);
    const fleets = db.fleets.filter((f) => f.ownerId === userId).map((f) => f.id);
    db.fleets = db.fleets.filter((f) => f.ownerId !== userId);
    db.fleetDrivers = db.fleetDrivers.filter((d) => !fleets.includes(d.fleetId));
    db.transfers = db.transfers.filter((t) => t.userId !== userId);
    db.questions = db.questions.filter((q) => q.userId !== userId);
    db.places = (db.places ?? []).filter((p) => p.userId !== userId);
    db.expenses = (db.expenses ?? []).filter((row) => row.userId !== userId);
    db.audit.push({ id: id(), at: new Date().toISOString(), actorId: userId, action: "account_deleted", entity: "user", entityId: userId });
  });
  const folder = path.join(dataDir(dir), "uploads", userId);
  if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true });
}
