export type DataSource =
  | "USER_PROVIDED"
  | "CALCULATED"
  | "IMPORTED"
  | "OFFICIAL_CONNECTED_SOURCE"
  | "AI_GENERATED"
  | "DEMO"
  | "DEVELOPMENT";

export type DataClass = "REAL" | "DEMO" | "DEVELOPMENT";
export type PlanId = "free" | "pro" | "fleet";
export type Tone = "good" | "warn" | "bad" | "info" | "neutral";
export type Role = "driver" | "admin";

export type DocumentKind =
  | "insurance"
  | "roadworthiness"
  | "registration"
  | "ownership"
  | "licence"
  | "sale_agreement"
  | "other";

export type ViolationKind =
  | "speed"
  | "seatbelt"
  | "signal"
  | "insurance"
  | "roadworthiness"
  | "other";

export type ViolationStatus =
  | "action_required"
  | "paid_user_reported"
  | "contest_in_preparation"
  | "overdue"
  | "closed";

export type DerivedDocStatus = "valid" | "expiring" | "expired" | "missing" | "unknown";

export type AttentionType =
  | "INSURANCE_EXPIRING"
  | "ROADWORTHINESS_EXPIRING"
  | "REGISTRATION_EXPIRING"
  | "LICENCE_EXPIRING"
  | "DOCUMENT_EXPIRED"
  | "NEW_VIOLATION"
  | "FINE_DEADLINE"
  | "DOCUMENT_MISSING"
  | "VEHICLE_TRANSFER_PENDING"
  | "SAFETY_PATTERN"
  | "HIGH_RISK_DRIVING_PATTERN";

export type Severity = "urgent" | "attention" | "info" | "positive";

export type ScoreWindow = "today" | "week" | "month" | "6months";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  plan: PlanId;
  planStatus: "active" | "pending_checkout";
  onboardingCompleted: boolean;
  createdAt: string;
  activeVehicleId: string | null;
  dataClass: Exclude<DataClass, "DEMO">;
  prefs: NotificationPrefs;
  emergency?: EmergencyDetails;
}

export interface EmergencyDetails {
  contactName: string;
  contactPhone: string;
  insurerName: string;
  insurerPhone: string;
  bloodGroup: string;
  medicalNote: string;
}

export type ExpenseKind = "fuel" | "repair" | "maintenance" | "insurance" | "roadworthiness" | "violation" | "tyres" | "other" | "takings";

export interface ExpenseRecord {
  id: string;
  userId: string;
  vehicleId: string | null;
  kind: ExpenseKind;
  direction: "in" | "out";
  amountGhs: number;
  spentOn: string;
  note: string;
  source: "USER_PROVIDED";
}

export interface NotificationPrefs {
  positive: boolean;
  information: boolean;
  important: boolean;
  traffic: boolean;
  vehicle: boolean;
  safety: boolean;
  system: boolean;
}

export interface VehicleRecord {
  id: string;
  userId: string;
  plate: string;
  make: string;
  model: string;
  year: number | null;
  colour: string;
  createdAt: string;
  dataClass: DataClass;
}

export interface DocumentRecord {
  id: string;
  userId: string;
  vehicleId: string | null;
  kind: DocumentKind;
  label: string;
  expiresOn: string | null;
  updatedAt: string;
  verification: "user_provided" | "not_verified";
  fileName: string | null;
  storedName: string | null;
  mime: string | null;
  note: string;
  source: DataSource;
  dataClass: DataClass;
}

export interface ViolationRecord {
  id: string;
  userId: string;
  vehicleId: string | null;
  kind: ViolationKind;
  title: string;
  occurredAt: string;
  locationLabel: string;
  amountGhs: number | null;
  status: Exclude<ViolationStatus, "overdue">;
  deadline: string | null;
  deadlineConfirmed: boolean;
  recordedSpeedKph: number | null;
  applicableLimitKph: number | null;
  source: DataSource;
  rawMessage: string | null;
  scamAssessment: ScamAssessment;
  ticketNumber: string | null;
  dataClass: DataClass;
}

export type ScamAssessment =
  | "suspicious"
  | "resembles_public_pattern"
  | "insufficient"
  | "not_applicable";

export interface EvidenceRecord {
  id: string;
  violationId: string;
  userId: string;
  kind: "photo" | "video" | "note" | "demo_illustration";
  fileName: string | null;
  storedName: string | null;
  mime: string | null;
  capturedAt: string | null;
  note: string;
  source: DataSource;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  violationId: string;
  amountGhs: number;
  paidOn: string;
  reference: string;
  note: string;
  source: "USER_PROVIDED" | "DEMO" | "DEVELOPMENT";
}

export interface ContestRecord {
  id: string;
  userId: string;
  violationId: string;
  userNotes: string;
  createdAt: string;
  status: "preparing";
  analysis: AIAnswer | null;
}

export interface SpeedSample {
  t: string;
  speedKph: number;
  limitKph: number;
}

export interface DrivingSessionRecord {
  id: string;
  userId: string;
  vehicleId: string | null;
  driverId: string | null;
  startedAt: string;
  endedAt: string;
  roadContext: string;
  samples: SpeedSample[];
  harshBrakes: number;
  harshAccelerations: number;
  simulated: boolean;
  source: DataSource;
  dataClass: DataClass;
  originLabel?: string;
  destinationLabel?: string;
  distanceM?: number;
  geometry?: { lat: number; lng: number }[];
  notes?: string[];
}

export interface SavedPlaceRecord {
  id: string;
  userId: string;
  slot: "home" | "work" | "school" | "favourite";
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface StoredNotification {
  id: string;
  userId: string;
  category: Severity;
  topic: "traffic" | "vehicle" | "safety" | "system";
  title: string;
  body: string;
  href: string;
  createdAt: string;
  source: DataSource;
}

export interface ReadState {
  userId: string;
  id: string;
  readAt: string | null;
  archivedAt: string | null;
}

export interface FleetRecord {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  dataClass: DataClass;
}

export interface FleetDriverRecord {
  id: string;
  fleetId: string;
  name: string;
  plate: string;
  vehicleLabel: string;
  linkedVehicleId: string | null;
  notes: string;
  createdAt: string;
  dataClass: DataClass;
}

export interface TransferRecord {
  id: string;
  userId: string;
  vehicleId: string;
  sold: boolean;
  saleDate: string | null;
  buyerName: string;
  buyerPhone: string;
  notes: string;
  ownershipUpdate: "unknown" | "user_says_submitted" | "not_started";
  updatedAt: string;
}

export interface QuestionRecord {
  id: string;
  userId: string;
  question: string;
  answer: AIAnswer;
  createdAt: string;
}

export interface AuditRecord {
  id: string;
  at: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
}

export interface AISection {
  kind: "FACT" | "USER_PROVIDED" | "AI_INFERENCE" | "RECOMMENDATION";
  heading: string;
  body: string;
}

export interface AIAnswer {
  title: string;
  confidenceNote: string;
  sections: AISection[];
  refused: boolean;
  provider: "local" | "openai" | "anthropic";
}

export interface Database {
  users: UserRecord[];
  credentials: { userId: string; salt: string; hash: string }[];
  vehicles: VehicleRecord[];
  documents: DocumentRecord[];
  violations: ViolationRecord[];
  evidence: EvidenceRecord[];
  payments: PaymentRecord[];
  contests: ContestRecord[];
  sessions: DrivingSessionRecord[];
  notifications: StoredNotification[];
  reads: ReadState[];
  fleets: FleetRecord[];
  fleetDrivers: FleetDriverRecord[];
  transfers: TransferRecord[];
  questions: QuestionRecord[];
  audit: AuditRecord[];
  places: SavedPlaceRecord[];
  expenses: ExpenseRecord[];
}

export interface Entitlements {
  plan: PlanId;
  maxVehicles: number;
  ai: boolean;
  fleet: boolean;
  historicalAnalytics: boolean;
  extraReminders: boolean;
  evidenceNotes: boolean;
}

export interface AttentionItem {
  id: string;
  type: AttentionType;
  severity: Severity;
  category: string;
  title: string;
  detail: string;
  deadline: string | null;
  importance: number;
  urgency: number;
  recommendedAction: string;
  href: string;
  source: DataSource;
  score: number;
}

export interface ScoreComponents {
  speed: number;
  braking: number;
  acceleration: number;
  traffic: number;
  consistency: number;
}

export interface ScoreView {
  status: "ready" | "insufficient";
  window: ScoreWindow;
  overall: number | null;
  band: string | null;
  components: ScoreComponents | null;
  samples: number;
  minutes: number;
  requiredSamples: number;
  requiredMinutes: number;
  source: "CALCULATED" | "DEMO";
  sessionsInWindow: number;
  note: string;
}

export interface Insight {
  id: string;
  text: string;
  source: "CALCULATED" | "DEMO";
}

export interface Achievement {
  id: string;
  title: string;
  detail: string;
  earned: boolean;
}

export interface DocumentView {
  id: string;
  vehicleId: string | null;
  kind: DocumentKind;
  label: string;
  expiresOn: string | null;
  updatedAt: string;
  status: DerivedDocStatus;
  daysRemaining: number | null;
  verification: "user_provided" | "not_verified";
  verificationLabel: string;
  hasFile: boolean;
  fileName: string | null;
  mime: string | null;
  note: string;
  source: DataSource;
}

export interface EvidenceView {
  id: string;
  kind: EvidenceRecord["kind"];
  url: string | null;
  note: string;
  capturedAt: string | null;
  source: DataSource;
  mime: string | null;
}

export interface ViolationView {
  id: string;
  vehicleId: string | null;
  kind: ViolationKind;
  title: string;
  occurredAt: string;
  locationLabel: string;
  amountGhs: number | null;
  status: ViolationStatus;
  storedStatus: Exclude<ViolationStatus, "overdue">;
  deadline: string | null;
  deadlineConfirmed: boolean;
  daysRemaining: number | null;
  recordedSpeedKph: number | null;
  applicableLimitKph: number | null;
  source: DataSource;
  rawMessage: string | null;
  scamAssessment: ScamAssessment;
  ticketNumber: string | null;
  evidence: EvidenceView[];
  lateEstimateGhs: number | null;
  plate: string | null;
}

export interface PaymentView {
  id: string;
  violationId: string;
  amountGhs: number;
  paidOn: string;
  reference: string;
  note: string;
  source: PaymentRecord["source"];
  title: string;
}

export interface VehicleView {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number | null;
  colour: string;
  name: string;
  compliance: number | null;
  standing: "good" | "attention" | "high_risk" | "unknown";
  standingLabel: string;
  trafficLabel: string;
  trafficTone: Tone;
  dataClass: DataClass;
}

export interface TimelinePoint {
  id: string;
  label: string;
  date: string;
  days: number;
  tone: Tone;
}

export interface SessionView {
  id: string;
  driverId: string | null;
  vehicleId: string | null;
  startedAt: string;
  endedAt: string;
  minutes: number;
  roadContext: string;
  samples: number;
  harshBrakes: number;
  harshAccelerations: number;
  simulated: boolean;
  source: DataSource;
  meanSpeed: number | null;
  speedCompliance: number | null;
  originLabel: string | null;
  destinationLabel: string | null;
  distanceM: number | null;
  notes: string[];
}

export interface EmergencyView {
  driverName: string;
  plate: string | null;
  vehicle: string | null;
  contactName: string;
  contactPhone: string;
  insurerName: string;
  insurerPhone: string;
  bloodGroup: string;
  medicalNote: string;
}

export interface ExpenseView {
  id: string;
  kind: ExpenseKind;
  direction: "in" | "out";
  amountGhs: number;
  spentOn: string;
  note: string;
  source: "USER_PROVIDED";
}

export interface PlaceView {
  id: string;
  slot: SavedPlaceRecord["slot"];
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface NotificationView {
  id: string;
  category: Severity;
  topic: "traffic" | "vehicle" | "safety" | "system";
  title: string;
  body: string;
  href: string;
  createdAt: string;
  source: DataSource;
  read: boolean;
  archived: boolean;
}

export interface FleetDriverView {
  id: string;
  name: string;
  plate: string;
  vehicleLabel: string;
  linkedVehicleId: string | null;
  notes: string;
  score: ScoreView;
  compliance: number | null;
  openViolations: number;
  documentStatus: string;
  documentTone: Tone;
  standing: VehicleView["standing"];
  dataClass: DataClass;
  harshBrakes: number;
  speedCompliance: number | null;
}

export interface FleetView {
  id: string;
  name: string;
  dataClass: DataClass;
  drivers: FleetDriverView[];
  counts: { total: number; good: number; attention: number; highRisk: number };
  sample: boolean;
}

export interface BriefView {
  ready: boolean;
  headline: string;
  checks: { ok: boolean; label: string }[];
  oneThing: { title: string; detail: string; href: string } | null;
}

export interface HeroView {
  state: "setup" | "ready" | "attention" | "urgent";
  title: string;
  subtitle: string;
}

export interface StatusPill {
  id: string;
  label: string;
  value: string;
  tone: Tone;
  href: string;
}

export interface ContestView {
  id: string;
  violationId: string;
  userNotes: string;
  createdAt: string;
  status: "preparing";
  analysis: AIAnswer | null;
}

export interface Workspace {
  mode: "user" | "demo";
  dataClass: DataClass;
  generatedAt: string;
  viewer: {
    id: string;
    name: string;
    firstName: string;
    email: string;
    role: Role;
    plan: PlanId;
    planStatus: "active" | "pending_checkout";
    onboardingCompleted: boolean;
  };
  entitlements: Entitlements;
  greeting: string;
  dayLabel: string;
  hero: HeroView;
  score: ScoreView;
  scores: Record<ScoreWindow, ScoreView>;
  activeVehicle: VehicleView | null;
  vehicles: VehicleView[];
  statuses: StatusPill[];
  primaryAttention: AttentionItem | null;
  attention: AttentionItem[];
  documents: DocumentView[];
  violations: ViolationView[];
  payments: PaymentView[];
  contests: ContestView[];
  notifications: NotificationView[];
  sessions: SessionView[];
  places: PlaceView[];
  emergency: EmergencyView;
  expenses: ExpenseView[];
  insights: Insight[];
  achievements: Achievement[];
  brief: BriefView;
  fleet: FleetView | null;
  prefs: NotificationPrefs;
  transfers: TransferRecord[];
  questions: QuestionRecord[];
  timeline: TimelinePoint[];
  connectivity: {
    liveTraffic: false;
    officialViolations: false;
    officialPayments: false;
    ocr: false;
    checkout: false;
  };
  totals: {
    outstandingGhs: number;
    activeViolations: number;
    paidThisYearGhs: number;
  };
}

export const defaultPrefs = (): NotificationPrefs => ({
  positive: true,
  information: true,
  important: true,
  traffic: true,
  vehicle: true,
  safety: true,
  system: true,
});
