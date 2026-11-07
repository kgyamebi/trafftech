import type { Workspace } from "./types";
import { formatDay, ghs } from "./dates";

export interface CommandHit {
  id: string;
  label: string;
  detail: string;
  href: string;
}

const PAGES: CommandHit[] = [
  { id: "now", label: "Driving screen", detail: "Speed, limit, direction, voice", href: "/now" },
  { id: "protect", label: "Protection", detail: "What to know before it costs money", href: "/protect" },
  { id: "work", label: "Work", detail: "Trips, papers, costs you enter", href: "/work" },
  { id: "emergency", label: "Emergency card", detail: "Name, vehicle, contact", href: "/emergency" },
  { id: "home", label: "Map", detail: "Where you are going", href: "/home" },
  { id: "drive", label: "Drive", detail: "The same map", href: "/home" },
  { id: "vehicle", label: "Vehicle", detail: "Digital garage", href: "/vehicle" },
  { id: "traffic", label: "Traffic", detail: "Notices, payments, evidence", href: "/traffic" },
  { id: "score", label: "Driver score", detail: "How the calculation is moving", href: "/score" },
  { id: "documents", label: "Documents", detail: "Vault", href: "/documents" },
  { id: "notifications", label: "Notifications", detail: "What changed", href: "/notifications" },
  { id: "ask", label: "Ask Driver Intelligence", detail: "Questions about your records", href: "/ask" },
  { id: "fleet", label: "Fleet", detail: "Drivers you manage", href: "/fleet" },
  { id: "brief", label: "Daily brief", detail: "This morning, in one screen", href: "/brief" },
  { id: "settings", label: "Settings", detail: "Preferences, privacy, plan", href: "/settings" },
  { id: "privacy", label: "Privacy centre", detail: "What is stored and why", href: "/settings/privacy" },
  { id: "inbox", label: "Import a notice", detail: "Paste a message you received", href: "/traffic/inbox" },
  { id: "analytics", label: "Analytics", detail: "Charts that answer a question", href: "/analytics" },
];

export function commandSearch(ws: Workspace, query: string): CommandHit[] {
  const q = query.trim().toLowerCase();
  const dynamic: CommandHit[] = [];
  const insurance = ws.documents.find((d) => d.kind === "insurance" && (!ws.activeVehicle || d.vehicleId === ws.activeVehicle.id));
  if (insurance?.expiresOn) {
    dynamic.push({
      id: "insurance-expiry",
      label: "Insurance expiry",
      detail: formatDay(insurance.expiresOn),
      href: "/documents",
    });
  }
  dynamic.push({
    id: "fines",
    label: "Outstanding fines",
    detail: ws.totals.outstandingGhs ? ghs(ws.totals.outstandingGhs) : "None saved",
    href: "/traffic",
  });
  if (ws.score.overall != null) {
    dynamic.push({
      id: "explain-score",
      label: "Explain my score",
      detail: `${ws.score.overall} · ${ws.score.band}`,
      href: "/ask?q=Why%20did%20my%20score%20change",
    });
  }
  for (const v of ws.vehicles) {
    dynamic.push({ id: `veh-${v.id}`, label: v.plate, detail: v.name, href: `/vehicle/${v.id}` });
  }
  const all = [...dynamic, ...PAGES];
  if (!q) return all.slice(0, 8);
  return all.filter((h) => `${h.label} ${h.detail}`.toLowerCase().includes(q)).slice(0, 8);
}
