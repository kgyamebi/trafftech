import type { DriverRole } from "./drive-prefs";
import type { TravelMode } from "./navigation";

export type VehicleBody = "saloon" | "suv" | "taxi" | "trotro" | "okada" | "truck" | "delivery" | "bicycle" | "walk";
export type PaintId = "white" | "silver" | "black" | "red" | "blue" | "green" | "yellow" | "cream" | "orange";
export type StripeId = "none" | "red" | "blue" | "green" | "yellow";

export interface VehicleStored {
  trip: VehicleBody | "role";
  paint: PaintId | null;
  stripe: StripeId;
  name: string;
}

export interface VehicleMark {
  body: VehicleBody;
  paint: string;
  stripe: string | null;
  name: string;
  label: string;
  note: string;
}

export const PAINTS: { id: PaintId; label: string; hex: string }[] = [
  { id: "white", label: "White", hex: "#f4f1ea" },
  { id: "silver", label: "Silver", hex: "#c5c8ce" },
  { id: "black", label: "Black", hex: "#1c1e22" },
  { id: "red", label: "Red", hex: "#9c2b2b" },
  { id: "blue", label: "Blue", hex: "#1e4d8c" },
  { id: "green", label: "Green", hex: "#1f6b45" },
  { id: "yellow", label: "Yellow", hex: "#e2b340" },
  { id: "cream", label: "Cream", hex: "#f3e2b8" },
  { id: "orange", label: "Orange", hex: "#d36a2a" },
];

export const DRIVING_BODIES: { id: VehicleBody; label: string }[] = [
  { id: "saloon", label: "Car" },
  { id: "suv", label: "SUV" },
  { id: "taxi", label: "Taxi" },
  { id: "trotro", label: "Trotro" },
  { id: "okada", label: "Okada" },
  { id: "truck", label: "Truck" },
  { id: "delivery", label: "Delivery" },
];

const BODIES = new Set<VehicleBody>([...DRIVING_BODIES.map((item) => item.id), "bicycle", "walk"]);

export function roleBody(role: DriverRole): VehicleBody {
  if (role === "trotro") return "trotro";
  if (role === "taxi") return "taxi";
  if (role === "truck") return "truck";
  if (role === "delivery") return "delivery";
  return "saloon";
}

export function bodyRole(body: VehicleBody): DriverRole | null {
  if (body === "saloon" || body === "suv") return "private";
  if (body === "trotro") return "trotro";
  if (body === "taxi") return "taxi";
  if (body === "truck") return "truck";
  if (body === "delivery") return "delivery";
  return null;
}

export function defaultPaint(body: VehicleBody): PaintId {
  if (body === "trotro") return "cream";
  if (body === "taxi") return "yellow";
  if (body === "suv") return "silver";
  if (body === "okada") return "black";
  if (body === "delivery") return "green";
  if (body === "bicycle" || body === "walk") return "blue";
  return "white";
}

export function cleanVehicleName(value: string): string {
  return value.replace(/[^A-Za-z0-9 .'-]/g, "").replace(/\s+/g, " ").trim().slice(0, 14);
}

export function parseVehicleStored(raw: string | null | undefined): VehicleStored | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VehicleStored>;
    const trip: VehicleStored["trip"] = parsed.trip === "role" || DRIVING_BODIES.some((item) => item.id === parsed.trip) ? parsed.trip ?? "role" : "role";
    const paint = PAINTS.some((item) => item.id === parsed.paint) ? parsed.paint ?? null : null;
    const stripe = parsed.stripe === "red" || parsed.stripe === "blue" || parsed.stripe === "green" || parsed.stripe === "yellow" || parsed.stripe === "none" ? parsed.stripe : "none";
    return { trip, paint, stripe, name: cleanVehicleName(String(parsed.name ?? "")) };
  } catch {
    return null;
  }
}

export function resolveVehicle(input: { mode: TravelMode; role: DriverRole; stored: VehicleStored | null }): VehicleMark {
  const chosen = input.mode === "walking" ? "walk" : input.mode === "cycling" ? "bicycle" : input.stored && input.stored.trip !== "role" ? input.stored.trip : roleBody(input.role);
  const body = BODIES.has(chosen) ? chosen : roleBody(input.role);
  const paintId = input.stored?.paint ?? defaultPaint(body);
  const paint = PAINTS.find((item) => item.id === paintId)?.hex ?? "#f4f1ea";
  const stripeId = body === "trotro" ? (input.stored?.stripe && input.stored.stripe !== "none" ? input.stored.stripe : "red") : "none";
  const stripe = stripeId === "none" ? null : PAINTS.find((item) => item.id === stripeId)?.hex ?? null;
  const name = body === "trotro" ? cleanVehicleName(input.stored?.name ?? "") : "";
  return {
    body,
    paint,
    stripe,
    name,
    label: labelFor(body),
    note: noteFor(body, input.mode),
  };
}

export function vehicleShapes(mark: VehicleMark, demo: boolean): string {
  const roof = shade(mark.paint, 0.72);
  const ring = demo ? `<circle cx="0" cy="0" r="30" fill="none" stroke="#c4a574" stroke-width="1.4" stroke-dasharray="3 2"/>` : "";
  return `${ring}${drawBody(mark, roof)}`;
}

export function vehicleMarkup(mark: VehicleMark, demo: boolean): string {
  return `<svg viewBox="-32 -46 64 92" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${vehicleShapes(mark, demo)}</svg>`;
}

function labelFor(body: VehicleBody): string {
  if (body === "saloon") return "Car";
  if (body === "walk") return "Walking";
  if (body === "bicycle") return "Bicycle";
  if (body === "okada") return "Okada";
  return DRIVING_BODIES.find((item) => item.id === body)?.label ?? "Vehicle";
}

function noteFor(body: VehicleBody, mode: TravelMode): string {
  if (mode === "walking") return "The person follows this phone. It is not a camera view.";
  if (mode === "cycling") return "The bicycle follows this phone on the cycling route.";
  if (body === "okada") return "The okada is drawn on the driving route. A separate motorcycle route is not connected.";
  if (body === "trotro") return "The trotro follows this phone for this trip. Switch to a car when you are not in the trotro.";
  return `The ${labelFor(body).toLowerCase()} follows this phone. It is not a camera view.`;
}

function drawBody(mark: VehicleMark, roof: string): string {
  const paint = mark.paint;
  if (mark.body === "walk") return walker(paint);
  if (mark.body === "bicycle") return bicycle(paint);
  if (mark.body === "okada") return okada(paint);
  if (mark.body === "trotro") return trotro(paint, roof, mark.stripe ?? "#9c2b2b", mark.name);
  if (mark.body === "truck") return truck(paint, roof);
  if (mark.body === "delivery") return delivery(paint, roof);
  if (mark.body === "suv") return car(paint, roof, 15, 36, false);
  if (mark.body === "taxi") return `${car(paint, roof, 12, 32, false)}<rect x="-6" y="-8" width="12" height="5" rx="1" fill="#161712"/><text x="0" y="-4.2" text-anchor="middle" font-size="3.2" fill="#f4f1ea" font-family="sans-serif">TAXI</text>`;
  return car(paint, roof, 12, 32, false);
}

function car(paint: string, roof: string, half: number, length: number, _high: boolean): string {
  const y = -length / 2;
  return `
    ${wheels(half + 3, y + 8, y + length - 16)}
    <rect x="${-half}" y="${y}" width="${half * 2}" height="${length}" rx="9" fill="${paint}" stroke="#161712" stroke-width="1.3"/>
    <rect x="${-half + 3}" y="${y + 4}" width="${half * 2 - 6}" height="9" rx="2" fill="#d5e7ef"/>
    <rect x="${-half + 3}" y="${-6}" width="${half * 2 - 6}" height="12" rx="2" fill="${roof}"/>
    <rect x="${-half + 3}" y="${y + length - 14}" width="${half * 2 - 6}" height="7" rx="2" fill="#8ea8b6"/>
    <rect x="-4" y="${y - 1}" width="3" height="2.4" rx="0.6" fill="#fff6d8"/>
    <rect x="1" y="${y - 1}" width="3" height="2.4" rx="0.6" fill="#fff6d8"/>
  `;
}

function trotro(paint: string, roof: string, stripe: string, name: string): string {
  const label = name ? `<text x="0" y="3" text-anchor="middle" font-size="5" fill="#161712" font-family="sans-serif">${escapeXml(name)}</text>` : "";
  return `
    ${wheels(16, -28, 16)}
    <rect x="-14" y="-40" width="28" height="78" rx="6" fill="${paint}" stroke="#161712" stroke-width="1.3"/>
    <rect x="-14" y="-2" width="28" height="5" fill="${stripe}"/>
    <rect x="-10" y="-34" width="20" height="8" rx="2" fill="#d5e7ef"/>
    <rect x="-10" y="-22" width="8" height="6" rx="1" fill="#b7cdd6"/>
    <rect x="2" y="-22" width="8" height="6" rx="1" fill="#b7cdd6"/>
    <rect x="-10" y="8" width="8" height="6" rx="1" fill="#b7cdd6"/>
    <rect x="2" y="8" width="8" height="6" rx="1" fill="#b7cdd6"/>
    <rect x="-10" y="22" width="20" height="8" rx="2" fill="${roof}"/>
    ${label}
  `;
}

function truck(paint: string, roof: string): string {
  return `
    ${wheels(16, -24, 18)}
    <rect x="-14" y="-8" width="28" height="42" rx="3" fill="${roof}" stroke="#161712" stroke-width="1.2"/>
    <rect x="-13" y="-36" width="26" height="26" rx="6" fill="${paint}" stroke="#161712" stroke-width="1.3"/>
    <rect x="-9" y="-32" width="18" height="8" rx="2" fill="#d5e7ef"/>
    <rect x="-4" y="-37" width="3" height="2.2" rx="0.5" fill="#fff6d8"/>
    <rect x="1" y="-37" width="3" height="2.2" rx="0.5" fill="#fff6d8"/>
  `;
}

function delivery(paint: string, roof: string): string {
  return `
    ${wheels(14, -18, 14)}
    <rect x="-13" y="-34" width="26" height="28" rx="6" fill="${paint}" stroke="#161712" stroke-width="1.3"/>
    <rect x="-9" y="-30" width="18" height="8" rx="2" fill="#d5e7ef"/>
    <rect x="-12" y="-4" width="24" height="30" rx="3" fill="${roof}" stroke="#161712" stroke-width="1.2"/>
    <rect x="-4" y="-35" width="3" height="2.2" rx="0.5" fill="#fff6d8"/>
    <rect x="1" y="-35" width="3" height="2.2" rx="0.5" fill="#fff6d8"/>
  `;
}

function okada(paint: string): string {
  return `
    <circle cx="0" cy="-28" r="7" fill="#1a1c20"/>
    <circle cx="0" cy="26" r="7" fill="#1a1c20"/>
    <rect x="-3" y="-22" width="6" height="44" rx="3" fill="${paint}" stroke="#161712" stroke-width="1"/>
    <circle cx="0" cy="-2" r="8" fill="#3d2b22"/>
    <circle cx="0" cy="-8" r="4.2" fill="#e4c2a4" stroke="#161712" stroke-width="0.6"/>
  `;
}

function bicycle(paint: string): string {
  return `
    <circle cx="-10" cy="16" r="8" fill="none" stroke="#1a1c20" stroke-width="2"/>
    <circle cx="12" cy="16" r="8" fill="none" stroke="#1a1c20" stroke-width="2"/>
    <path d="M-10 16 L0 -2 L12 16 L0 -2 L0 -16" fill="none" stroke="${paint}" stroke-width="2.2"/>
    <circle cx="0" cy="-8" r="6" fill="#3d2b22"/>
    <circle cx="0" cy="-14" r="3.4" fill="#e4c2a4" stroke="#161712" stroke-width="0.6"/>
  `;
}

function walker(paint: string): string {
  return `
    <circle cx="0" cy="-18" r="6" fill="#e4c2a4" stroke="#161712" stroke-width="0.8"/>
    <rect x="-6" y="-12" width="12" height="16" rx="4" fill="${paint}" stroke="#161712" stroke-width="0.8"/>
    <path d="M-3 4 L-7 22 M3 4 L8 20" fill="none" stroke="#161712" stroke-width="2" stroke-linecap="round"/>
  `;
}

function wheels(x: number, front: number, back: number): string {
  return [-1, 1].map((side) => `
    <rect x="${side * x - 2.5}" y="${front}" width="5" height="11" rx="1.6" fill="#1a1c20"/>
    <rect x="${side * x - 2.5}" y="${back}" width="5" height="11" rx="1.6" fill="#1a1c20"/>
  `).join("");
}

function shade(hex: string, mix: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * mix))).toString(16).padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);
}
