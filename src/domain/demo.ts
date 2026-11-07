import { addDays, accraToday } from "./dates";
import { assembleWorkspace } from "./assemble";
import { defaultPrefs, type Database, type DrivingSessionRecord, type SpeedSample, type UserRecord, type Workspace } from "./types";

const DEMO_USER_ID = "demo-ama";
const DEMO_VEHICLE_ID = "demo-corolla";

function samples(limit: number, base: number, overs: number[], total: number, startMs: number): SpeedSample[] {
  const list: SpeedSample[] = [];
  for (let i = 0; i < total; i++) {
    const speed = i < overs.length ? overs[i] : base;
    list.push({
      t: new Date(startMs + i * 12_000).toISOString(),
      speedKph: speed,
      limitKph: limit,
    });
  }
  return list;
}

/** 194 steady samples and 6 over-limit samples → speed compliance 97.
 * Spread is tuned so consistency lands on 93 with CONSISTENCY_SCALE. */
export function demoPersonalSessions(now: Date): DrivingSessionRecord[] {
  const today = accraToday(now);
  const end = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 40 * 60 * 1000);
  const overs = [62, 62, 62, 62, 62, 62];
  const current: DrivingSessionRecord = {
    id: "demo-session-current",
    userId: DEMO_USER_ID,
    vehicleId: DEMO_VEHICLE_ID,
    driverId: null,
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    roadContext: "Urban · 50 km/h selected",
    samples: samples(50, 46, overs, 200, start.getTime()),
    harshBrakes: 3,
    harshAccelerations: 2,
    simulated: false,
    source: "DEMO",
    dataClass: "DEMO",
  };

  const earlierEnd = new Date(`${addDays(today, -40)}T16:00:00.000Z`);
  const earlierStart = new Date(earlierEnd.getTime() - 35 * 60 * 1000);
  const earlierSamples: SpeedSample[] = [];
  for (let i = 0; i < 120; i++) {
    earlierSamples.push({
      t: new Date(earlierStart.getTime() + i * 15_000).toISOString(),
      speedKph: i < 24 ? 64 : 47,
      limitKph: 50,
    });
  }
  const earlier: DrivingSessionRecord = {
    id: "demo-session-earlier",
    userId: DEMO_USER_ID,
    vehicleId: DEMO_VEHICLE_ID,
    driverId: null,
    startedAt: earlierStart.toISOString(),
    endedAt: earlierEnd.toISOString(),
    roadContext: "Urban · 50 km/h selected",
    samples: earlierSamples,
    harshBrakes: 6,
    harshAccelerations: 3,
    simulated: false,
    source: "DEMO",
    dataClass: "DEMO",
  };

  return [earlier, current];
}

function fleetSessions(now: Date): DrivingSessionRecord[] {
  const end = new Date(now.getTime() - 26 * 60 * 60 * 1000);
  const make = (
    id: string,
    driverId: string,
    base: number,
    limit: number,
    overs: number,
    brakes: number,
    minutes: number,
  ): DrivingSessionRecord => {
    const start = new Date(end.getTime() - minutes * 60 * 1000);
    const list: SpeedSample[] = [];
    const total = 80;
    for (let i = 0; i < total; i++) {
      list.push({
        t: new Date(start.getTime() + i * ((minutes * 60_000) / total)).toISOString(),
        speedKph: i < overs ? limit + 18 : base,
        limitKph: limit,
      });
    }
    return {
      id,
      userId: DEMO_USER_ID,
      vehicleId: null,
      driverId,
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
      roadContext: "Recorded in the sample fleet",
      samples: list,
      harshBrakes: brakes,
      harshAccelerations: 1,
      simulated: false,
      source: "DEMO",
      dataClass: "DEMO",
    };
  };
  return [
    make("fs-kwame", "fd-kwame", 72, 90, 4, 7, 50),
    make("fs-akos", "fd-akosua", 48, 50, 0, 1, 40),
    make("fs-yaw", "fd-yaw", 70, 90, 50, 12, 45),
    make("fs-efua", "fd-efua", 49, 50, 1, 2, 40),
    make("fs-kofi", "fd-kofi", 44, 50, 0, 0, 36),
    make("fs-ama", "fd-ama-fleet", 47, 50, 1, 2, 40),
  ];
}

export function buildDemoDatabase(now: Date): {
  user: UserRecord;
  db: Database;
  fleetSessions: DrivingSessionRecord[];
} {
  const today = accraToday(now);
  const user: UserRecord = {
    id: DEMO_USER_ID,
    email: "ama@demo.nokware",
    name: "Ama Mensah",
    role: "driver",
    plan: "fleet",
    planStatus: "active",
    onboardingCompleted: true,
    createdAt: `${addDays(today, -120)}T08:00:00.000Z`,
    activeVehicleId: DEMO_VEHICLE_ID,
    dataClass: "REAL",
    prefs: defaultPrefs(),
  };

  const violationId = "demo-violation";
  const paidOn = addDays(today, -70);
  const occurred = `${addDays(today, -86)}T10:42:00.000Z`;

  const db: Database = {
    users: [user],
    credentials: [],
    vehicles: [
      {
        id: DEMO_VEHICLE_ID,
        userId: user.id,
        plate: "GH 1234-25",
        make: "Toyota",
        model: "Corolla",
        year: 2019,
        colour: "Silver",
        createdAt: user.createdAt,
        dataClass: "DEMO",
      },
    ],
    documents: [
      doc("demo-ins", user.id, DEMO_VEHICLE_ID, "insurance", "Insurance", addDays(today, 68), now),
      doc("demo-rw", user.id, DEMO_VEHICLE_ID, "roadworthiness", "Roadworthiness", addDays(today, 27), now),
      doc("demo-reg", user.id, DEMO_VEHICLE_ID, "registration", "Registration", addDays(today, 140), now),
      doc("demo-own", user.id, DEMO_VEHICLE_ID, "ownership", "Ownership", null, now),
      doc("demo-lic", user.id, null, "licence", "Driver licence", addDays(today, 240), now),
    ],
    violations: [
      {
        id: violationId,
        userId: user.id,
        vehicleId: DEMO_VEHICLE_ID,
        kind: "speed",
        title: "Speed violation",
        occurredAt: occurred,
        locationLabel: "Accra–Tema Motorway",
        amountGhs: 240,
        status: "paid_user_reported",
        deadline: addDays(occurred, 14),
        deadlineConfirmed: true,
        recordedSpeedKph: 112,
        applicableLimitKph: 100,
        source: "DEMO",
        rawMessage: null,
        scamAssessment: "not_applicable",
        ticketNumber: "001.000240112",
        dataClass: "DEMO",
      },
    ],
    evidence: [
      {
        id: "demo-evidence",
        violationId,
        userId: user.id,
        kind: "demo_illustration",
        fileName: null,
        storedName: null,
        mime: null,
        capturedAt: occurred,
        note: "Illustration only. This is not a photograph and not an enforcement image.",
        source: "DEMO",
      },
    ],
    payments: [
      {
        id: "demo-payment",
        userId: user.id,
        violationId,
        amountGhs: 240,
        paidOn,
        reference: "Recorded in the demo · not a receipt",
        note: "Ama recorded this payment inside the demo. No authority confirmed it.",
        source: "DEMO",
      },
    ],
    contests: [],
    sessions: demoPersonalSessions(now),
    notifications: [
      {
        id: "demo-welcome",
        userId: user.id,
        category: "info",
        topic: "system",
        title: "You are looking at demo data",
        body: "Ama’s car, score and notice are a sample. Nothing here is your record.",
        href: "/home",
        createdAt: now.toISOString(),
        source: "DEMO",
      },
    ],
    reads: [],
    fleets: [
      {
        id: "demo-fleet",
        ownerId: user.id,
        name: "Sample fleet",
        createdAt: user.createdAt,
        dataClass: "DEMO",
      },
    ],
    fleetDrivers: [
      driver("fd-kwame", "Kwame A.", "GW 2210-22", "Nissan NV350"),
      driver("fd-akosua", "Akosua B.", "GR 9081-23", "Toyota Hiace"),
      driver("fd-yaw", "Yaw M.", "GE 1144-21", "Hyundai County"),
      driver("fd-efua", "Efua D.", "GW 3302-24", "Toyota Corolla"),
      driver("fd-kofi", "Kofi S.", "GR 4419-20", "Honda Civic"),
      driver("fd-ama-fleet", "Ama M.", "GH 1234-25", "Toyota Corolla"),
    ],
    transfers: [],
    questions: [],
    audit: [],
    places: [],
    expenses: [],
    fieldConsents: [],
    roadCells: [],
    fieldReports: [],
    communityPlaces: [],
    reporterStanding: [],
    fieldEvents: [],
    fieldFolds: [],
    lessons: [],
    asks: [],
    livingDay: "",
  };

  return { user, db, fleetSessions: fleetSessions(now) };
}

function doc(
  id: string,
  userId: string,
  vehicleId: string | null,
  kind: Database["documents"][number]["kind"],
  label: string,
  expiresOn: string | null,
  now: Date,
): Database["documents"][number] {
  return {
    id,
    userId,
    vehicleId,
    kind,
    label,
    expiresOn,
    updatedAt: now.toISOString(),
    verification: "user_provided",
    fileName: null,
    storedName: null,
    mime: null,
    note: "",
    source: "DEMO",
    dataClass: "DEMO",
  };
}

function driver(id: string, name: string, plate: string, vehicleLabel: string): Database["fleetDrivers"][number] {
  return {
    id,
    fleetId: "demo-fleet",
    name,
    plate,
    vehicleLabel,
    linkedVehicleId: null,
    notes: "",
    createdAt: "2026-08-01T00:00:00.000Z",
    dataClass: "DEMO",
  };
}

export function buildDemoWorkspace(now: Date): Workspace {
  const { user, db, fleetSessions } = buildDemoDatabase(now);
  const ws = assembleWorkspace({
    now,
    mode: "demo",
    user: { ...user, dataClass: "REAL" },
    vehicles: db.vehicles,
    documents: db.documents,
    violations: db.violations,
    evidence: db.evidence,
    payments: db.payments,
    contests: db.contests,
    sessions: db.sessions,
    notifications: db.notifications,
    reads: [],
    fleet: db.fleets[0],
    fleetDrivers: db.fleetDrivers,
    fleetSessions,
    transfers: [],
    questions: [],
  });
  return ws;
}

export function demoWritesBlocked(mode: "user" | "demo"): boolean {
  return mode === "demo";
}
