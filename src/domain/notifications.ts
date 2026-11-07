import { reminderLeads } from "./entitlements";
import type { AttentionItem, NotificationPrefs, NotificationView, PlanId, ReadState, StoredNotification } from "./types";

const TOPIC: Record<string, NotificationView["topic"]> = {
  Traffic: "traffic",
  Vehicle: "vehicle",
  Safety: "safety",
};

export function leadBucket(days: number, leads: number[]): number | null {
  if (days < 0) return -1;
  const sorted = [...leads].sort((a, b) => a - b);
  for (const lead of sorted) {
    if (days <= lead) return lead;
  }
  return null;
}

export function notificationsFromAttention(input: {
  items: AttentionItem[];
  plan: PlanId;
  nowIso: string;
  reads: ReadState[];
  stored: StoredNotification[];
  prefs: NotificationPrefs;
  userId: string;
}): NotificationView[] {
  const leads = reminderLeads(input.plan);
  const derived: NotificationView[] = [];

  for (const item of input.items) {
    if (item.type.endsWith("EXPIRING") && item.deadline) {
      const days = item.urgency >= 80 ? 7 : item.importance >= 70 ? 14 : 30;
      const bucket = leadBucket(days <= 7 ? Math.min(days, 7) : days, leads);
      if (bucket == null || (bucket > 0 && !leads.includes(bucket) && bucket !== -1)) {
        if (!leads.some((l) => days <= l)) continue;
      }
      if (days > Math.max(...leads)) continue;
    }

    if (item.severity === "info" && item.type === "SAFETY_PATTERN" && !input.prefs.information) continue;

    const topic = TOPIC[item.category] ?? "system";
    derived.push({
      id: item.id,
      category: item.severity,
      topic,
      title: item.title,
      body: item.detail,
      href: item.href,
      createdAt: input.nowIso,
      source: item.source === "DEMO" ? "DEMO" : "CALCULATED",
      read: false,
      archived: false,
    });
  }

  const stored: NotificationView[] = input.stored
    .filter((n) => n.userId === input.userId)
    .map((n) => ({
      id: n.id,
      category: n.category,
      topic: n.topic,
      title: n.title,
      body: n.body,
      href: n.href,
      createdAt: n.createdAt,
      source: n.source,
      read: false,
      archived: false,
    }));

  const merged = new Map<string, NotificationView>();
  for (const n of [...stored, ...derived]) merged.set(n.id, n);

  const visible: NotificationView[] = [];
  for (const n of merged.values()) {
    if (n.category === "positive" && !input.prefs.positive) continue;
    if (n.category === "info" && !input.prefs.information) continue;
    if (n.category === "attention" && !input.prefs.important) continue;
    if (n.topic === "traffic" && !input.prefs.traffic && n.category !== "urgent") continue;
    if (n.topic === "vehicle" && !input.prefs.vehicle && n.category !== "urgent") continue;
    if (n.topic === "safety" && !input.prefs.safety && n.category !== "urgent") continue;
    if (n.topic === "system" && !input.prefs.system && n.category !== "urgent") continue;
    const read = input.reads.find((r) => r.userId === input.userId && r.id === n.id);
    visible.push({
      ...n,
      read: Boolean(read?.readAt),
      archived: Boolean(read?.archivedAt),
    });
  }

  const rank = { urgent: 0, attention: 1, info: 2, positive: 3 };
  return visible.sort((a, b) => (rank[a.category] ?? 4) - (rank[b.category] ?? 4) || (a.read ? 1 : 0) - (b.read ? 1 : 0));
}

export function allowsInApp(category: NotificationView["category"], prefs: NotificationPrefs): boolean {
  if (category === "urgent") return true;
  if (category === "attention") return prefs.important;
  if (category === "positive") return prefs.positive;
  if (category === "info") return prefs.information;
  return prefs.important;
}
