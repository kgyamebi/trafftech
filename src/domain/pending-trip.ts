export interface PendingTrip {
  clientId: string;
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
  raining?: boolean;
}

export function pendingTripFrom(raw: unknown): PendingTrip | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<PendingTrip>;
  if (typeof row.clientId !== "string" || row.clientId.length < 8 || row.clientId.length > 80) return null;
  if (typeof row.startedAt !== "string" || typeof row.endedAt !== "string") return null;
  if (typeof row.roadContext !== "string") return null;
  if (!Array.isArray(row.samples)) return null;
  const samples = row.samples
    .filter((sample): sample is PendingTrip["samples"][number] => {
      if (!sample || typeof sample !== "object") return false;
      const point = sample as Partial<PendingTrip["samples"][number]>;
      return typeof point.t === "string" && typeof point.speedKph === "number" && typeof point.limitKph === "number" && Number.isFinite(point.speedKph) && Number.isFinite(point.limitKph);
    })
    .slice(0, 2000);
  if (!samples.length) return null;
  const geometry = Array.isArray(row.geometry)
    ? row.geometry.filter((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng)).slice(0, 40)
    : undefined;
  return {
    clientId: row.clientId,
    vehicleId: typeof row.vehicleId === "string" ? row.vehicleId : null,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    roadContext: row.roadContext.slice(0, 40),
    samples,
    harshBrakes: Number.isFinite(row.harshBrakes) ? Math.max(0, Math.round(row.harshBrakes ?? 0)) : 0,
    harshAccelerations: Number.isFinite(row.harshAccelerations) ? Math.max(0, Math.round(row.harshAccelerations ?? 0)) : 0,
    originLabel: typeof row.originLabel === "string" ? row.originLabel.slice(0, 80) : undefined,
    destinationLabel: typeof row.destinationLabel === "string" ? row.destinationLabel.slice(0, 80) : undefined,
    distanceM: typeof row.distanceM === "number" && Number.isFinite(row.distanceM) ? Math.max(0, Math.round(row.distanceM)) : undefined,
    geometry: geometry && geometry.length >= 2 ? geometry : undefined,
    notes: Array.isArray(row.notes) ? row.notes.filter((note): note is string => typeof note === "string").map((note) => note.slice(0, 140)).slice(0, 8) : undefined,
    raining: row.raining === true,
  };
}
