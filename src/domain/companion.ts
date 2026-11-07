import { accraToday, addDays } from "./dates";
import type { Language } from "./drive-prefs";
import { aboveSpeech, driveVoice, greet } from "./languages";
import type { VoiceMode } from "./navigation";
import { liveStatus, type ProtectionStatus } from "./protection";

export type SpeedSource = "gps" | "demo" | "none";
export type LimitOrigin = "user_declared" | "demo_script" | "openstreetmap" | "unavailable";

export interface SpeedBoard {
  caption: "GPS speed" | "Demo speed";
  speed: number | null;
  unit: "km/h";
  limit: number | null;
  limitLabel: string;
  status: ProtectionStatus;
  accuracy: "ok" | "reduced" | "none";
  line: string;
}

export function greetingLine(lang: Language, hour: number): { text: string; fallback: boolean } {
  return greet(lang, hour);
}

export function languageNote(lang: Language): string | null {
  return driveVoice(lang).note;
}

export function speedBoard(input: {
  source: SpeedSource;
  speedKph: number | null;
  accuracyM: number | null;
  limitKph: number | null;
  limitOrigin: LimitOrigin;
}): SpeedBoard {
  const limit = input.limitKph;
  const limitLabel =
    input.limitOrigin === "user_declared"
      ? "Limit you set"
      : input.limitOrigin === "openstreetmap"
        ? "Mapped road limit"
        : input.limitOrigin === "demo_script"
          ? "Demo script"
          : "No limit set";
  if (input.source === "none" || (input.source === "gps" && input.speedKph == null)) {
    return {
      caption: "GPS speed",
      speed: null,
      unit: "km/h",
      limit,
      limitLabel,
      status: "UNKNOWN",
      accuracy: input.source === "gps" ? "reduced" : "none",
      line: input.source === "gps" ? "GPS accuracy reduced" : "GPS speed unavailable",
    };
  }
  const speed = input.speedKph as number;
  const caption = input.source === "demo" ? "Demo speed" : "GPS speed";
  const status = liveStatus(speed, limit);
  const reduced = input.source === "gps" && (input.accuracyM == null || input.accuracyM > 50);
  const line =
    input.source === "demo"
      ? "Not your GPS. Not the vehicle speedometer."
      : input.limitOrigin === "openstreetmap"
        ? "From OpenStreetMap for this road. The posted sign controls."
        : reduced
          ? "GPS accuracy reduced"
          : limit == null
            ? "Speed limit information unavailable."
            : "From this phone. Not the vehicle speedometer.";
  return {
    caption,
    speed,
    unit: "km/h",
    limit,
    limitLabel,
    status,
    accuracy: input.source === "demo" ? "none" : reduced ? "reduced" : "ok",
    line,
  };
}

export function slowDownSpeech(board: SpeedBoard, lang: Language = "en"): string | null {
  if (board.caption !== "GPS speed" || board.status !== "ABOVE LIMIT" || board.limit == null || board.speed == null) return null;
  if (board.limitLabel !== "Mapped road limit" && board.limitLabel !== "Limit you set") return null;
  if (lang !== "en" && driveVoice(lang).slow) return aboveSpeech(lang, board.speed, board.limit);
  if (board.limitLabel === "Mapped road limit") return "Reduce speed. GPS speed is above the mapped limit for this road. The posted sign controls.";
  return "Reduce speed. GPS speed is above the limit you set.";
}

export function shouldSpeakNow(mode: VoiceMode, kind: "guidance" | "warning" | "brief"): boolean {
  if (mode === "off") return false;
  if (mode === "navigation") return kind === "guidance";
  if (mode === "important") return kind === "warning";
  return true;
}

export function plainAlert(title: string | null): string | null {
  if (!title) return null;
  if (/expir/i.test(title)) return "Vehicle document expires soon.";
  if (/notice|violation|fine|deadline/i.test(title)) return "A notice needs you.";
  return title;
}

export function alertSpeech(title: string | null): string | null {
  if (!title) return null;
  const days = title.match(/(\d+)\s+day/i);
  if (/expir/i.test(title) && days) return `A saved vehicle document expires in ${days[1]} days.`;
  if (/expir/i.test(title)) return "A saved vehicle document expires soon.";
  if (/notice|violation|fine|deadline/i.test(title) && days) return `A saved notice needs you in ${days[1]} days.`;
  return `${title.replace(/\.$/, "")}.`;
}

export function briefScript(input: {
  greeting: string;
  papersClear: boolean;
  openNotices: number;
  focusTitle: string | null;
}): string[] {
  const hello = `${input.greeting.split(",")[0].replace(/\.$/, "")}.`;
  const lines = [hello];
  if (input.papersClear && input.openNotices === 0 && !input.focusTitle) {
    lines.push("You are ready to drive.");
    lines.push("Your saved papers are in date.");
    lines.push("There are no open notices.");
    return lines;
  }
  const focus = alertSpeech(input.focusTitle);
  if (focus) lines.push(focus);
  if (input.openNotices > 0) {
    lines.push(input.openNotices === 1 ? "You have one open notice." : `You have ${input.openNotices} open notices.`);
  } else if (!focus) {
    lines.push("There are no open notices.");
  }
  return lines;
}

export function violationScript(input: {
  title: string;
  status: string;
  recordedSpeedKph: number | null;
  applicableLimitKph: number | null;
  daysRemaining: number | null;
  deadlineConfirmed: boolean;
  amountGhs: number | null;
}): string[] {
  const lines = [`You have a notice saved. ${input.title.replace(/\.$/, "")}.`];
  if (input.recordedSpeedKph != null) lines.push(`The recorded speed on it was ${input.recordedSpeedKph}.`);
  if (input.applicableLimitKph != null) lines.push(`The limit written on it was ${input.applicableLimitKph}.`);
  if (input.status === "paid_user_reported" || input.status === "closed") {
    lines.push("It is marked paid from what was entered here. That is not a government receipt.");
    return lines;
  }
  if (input.deadlineConfirmed && input.daysRemaining != null) {
    if (input.daysRemaining < 0) lines.push(`The date you confirmed was ${Math.abs(input.daysRemaining)} days ago.`);
    else if (input.daysRemaining === 0) lines.push("The date you confirmed is today.");
    else lines.push(`The date you confirmed is in ${input.daysRemaining} days.`);
  }
  if (input.amountGhs != null) lines.push(`The amount written on it is ${input.amountGhs} cedis.`);
  return lines;
}

export interface CostRow {
  spentOn: string;
  amountGhs: number;
  direction: "in" | "out";
}

export function workWindow(
  sessions: { startedAt: string; endedAt: string }[],
  costs: CostRow[],
  now: Date,
): {
  todayTrips: number;
  todayMinutes: number;
  weekTrips: number;
  weekMinutes: number;
  weekOut: number | null;
  monthOut: number | null;
  monthIn: number | null;
  trend: string;
} {
  const today = accraToday(now);
  const weekStart = addDays(today, -6);
  const monthStart = addDays(today, -29);
  const previousStart = addDays(today, -13);
  const minutes = (row: { startedAt: string; endedAt: string }) =>
    Math.max(0, Math.round((Date.parse(row.endedAt) - Date.parse(row.startedAt)) / 60_000));
  const dayOf = (iso: string) => accraToday(new Date(iso));
  const inSpan = (iso: string, start: string) => {
    const day = dayOf(iso);
    return day >= start && day <= today;
  };
  const sumSessions = (start: string) => {
    const rows = sessions.filter((row) => inSpan(row.endedAt, start));
    return { trips: rows.length, minutes: rows.reduce((total, row) => total + minutes(row), 0) };
  };
  const spent = (start: string, direction: "in" | "out") => {
    const rows = costs.filter((row) => row.direction === direction && row.spentOn >= start && row.spentOn <= today);
    if (!rows.length) return null;
    return rows.reduce((total, row) => total + row.amountGhs, 0);
  };
  const thisWeek = spent(weekStart, "out");
  const lastWeek = costs
    .filter((row) => row.direction === "out" && row.spentOn >= previousStart && row.spentOn < weekStart)
    .reduce((total, row) => total + row.amountGhs, 0);
  const lastWeekRows = costs.filter((row) => row.direction === "out" && row.spentOn >= previousStart && row.spentOn < weekStart);
  let trend = "Not enough saved costs to show a trend.";
  if (thisWeek != null && lastWeekRows.length) {
    const delta = thisWeek - lastWeek;
    trend = delta === 0 ? "Costs you entered are level with the previous week." : delta > 0 ? `Costs you entered are ${delta} cedis higher than the previous week.` : `Costs you entered are ${Math.abs(delta)} cedis lower than the previous week.`;
  }
  const todayStats = sumSessions(today);
  const weekStats = sumSessions(weekStart);
  return {
    todayTrips: todayStats.trips,
    todayMinutes: todayStats.minutes,
    weekTrips: weekStats.trips,
    weekMinutes: weekStats.minutes,
    weekOut: thisWeek,
    monthOut: spent(monthStart, "out"),
    monthIn: spent(monthStart, "in"),
    trend,
  };
}
