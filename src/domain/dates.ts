const TZ = "Africa/Accra";

export function accraParts(now: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const bag = Object.fromEntries(
    fmt.formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
  };
}

export function accraToday(now: Date): string {
  const p = accraParts(now);
  return isoDate(p.year, p.month, p.day);
}

export function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isCalendarDate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.slice(0, 10));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

export function addDays(iso: string, days: number): string {
  const day = iso.slice(0, 10);
  if (!isCalendarDate(day) || !Number.isFinite(days)) return day;
  const [y, m, d] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return isoDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function daysUntil(iso: string | null, now: Date): number | null {
  if (!iso || !isCalendarDate(iso)) return null;
  return daysBetween(accraToday(now), iso);
}

export function greetingFor(now: Date, firstName: string): string {
  const hour = accraParts(now).hour;
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${firstName}`;
}

export function dayLabel(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(now);
}

export function formatDay(iso: string | null): string {
  if (!iso) return "No date";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return formatDay(iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

export function minutesBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return ms / 60_000;
}

export function windowStart(now: Date, window: "today" | "week" | "month" | "6months"): string {
  const today = accraToday(now);
  if (window === "today") return `${today}T00:00:00.000Z`;
  const days = window === "week" ? 7 : window === "month" ? 30 : 183;
  return `${addDays(today, -days)}T00:00:00.000Z`;
}

export function inWindow(iso: string, startIso: string, now: Date): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) {
    const day = iso.slice(0, 10);
    return day >= startIso.slice(0, 10) && day <= accraToday(now);
  }
  return t >= new Date(startIso).getTime() && t <= now.getTime() + 60_000;
}

export function ghs(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  const formatted = new Intl.NumberFormat("en-GH", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `GH₵${formatted}`;
}

export function firstNameOf(name: string): string {
  const part = name.trim().split(/\s+/)[0];
  return part || "there";
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function sourceLabel(source: string): string {
  switch (source) {
    case "USER_PROVIDED":
      return "User provided";
    case "CALCULATED":
      return "Calculated";
    case "IMPORTED":
      return "Imported";
    case "OFFICIAL_CONNECTED_SOURCE":
      return "Official connected source";
    case "AI_GENERATED":
      return "AI generated";
    case "DEMO":
      return "Demo";
    case "MAPBOX":
      return "Mapbox";
    case "TOMTOM":
      return "TomTom";
    case "OPENSTREETMAP":
      return "OpenStreetMap";
    case "DEVELOPMENT":
      return "Development data";
    default:
      return source;
  }
}
