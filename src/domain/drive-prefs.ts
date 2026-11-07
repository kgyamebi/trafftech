import type { VoiceMode } from "./navigation";

export type Language = "en" | "tw" | "gaa" | "ee" | "ha";
export type DriverRole = "private" | "trotro" | "taxi" | "ride" | "truck" | "delivery";

export interface DrivePrefs {
  simple: boolean;
  easy: boolean;
  lang: Language;
  voice: VoiceMode;
  role: DriverRole;
}

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: "en", label: "English" },
  { id: "tw", label: "Twi" },
  { id: "gaa", label: "Ga" },
  { id: "ee", label: "Eʋegbe" },
  { id: "ha", label: "Hausa" },
];

export const ROLES: { id: DriverRole; label: string }[] = [
  { id: "private", label: "Private car" },
  { id: "trotro", label: "Trotro" },
  { id: "taxi", label: "Taxi" },
  { id: "ride", label: "Ride-hailing" },
  { id: "truck", label: "Truck" },
  { id: "delivery", label: "Delivery" },
];

export function defaultDrivePrefs(): DrivePrefs {
  return { simple: false, easy: false, lang: "en", voice: "off", role: "private" };
}

export function mergeDriveCookie(partial: Partial<DrivePrefs>) {
  if (typeof document === "undefined") return;
  const row = document.cookie.split("; ").find((item) => item.startsWith("nokware_drive="));
  const current = parseDrivePrefs(row ? decodeURIComponent(row.slice("nokware_drive=".length)) : null);
  const next = { ...current, ...partial };
  document.cookie = `nokware_drive=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=31536000; samesite=lax`;
}

export function parseDrivePrefs(raw: string | undefined | null): DrivePrefs {
  const base = defaultDrivePrefs();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<DrivePrefs>;
    const lang = LANGUAGES.some((item) => item.id === parsed.lang) ? parsed.lang : base.lang;
    const role = ROLES.some((item) => item.id === parsed.role) ? parsed.role : base.role;
    const voice = parsed.voice === "on" || parsed.voice === "important" || parsed.voice === "navigation" || parsed.voice === "off" ? parsed.voice : base.voice;
    return {
      simple: parsed.simple === true,
      easy: parsed.easy === true,
      lang: lang ?? "en",
      voice,
      role: role ?? "private",
    };
  } catch {
    return base;
  }
}
