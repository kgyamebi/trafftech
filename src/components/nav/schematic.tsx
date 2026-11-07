"use client";

import type { GeoPoint } from "@/domain/navigation";
import { resolveVehicle, vehicleShapes, type VehicleMark } from "@/domain/vehicle-look";

export function SchematicMap({
  lines,
  puck,
  night,
  mark,
}: {
  lines: { id: string; points: GeoPoint[]; active: boolean; faded?: boolean }[];
  puck: { lat: number; lng: number; bearing: number; demo: boolean } | null;
  night: boolean;
  mark?: VehicleMark;
}) {
  const points = lines.flatMap((line) => line.points);
  if (puck) points.push(puck);
  if (points.length < 2) {
    return (
      <div className={`grid h-full place-items-center ${night ? "bg-[#10110e] text-drive-fg/70" : "bg-[#e7e1d4] text-ink/70"}`}>
        <p className="max-w-xs px-6 text-center text-sm">The map will draw here when a route is ready.</p>
      </div>
    );
  }
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = Math.max(0.004, maxLat - minLat);
  const spanLng = Math.max(0.004, maxLng - minLng);
  const xy = (point: GeoPoint) => {
    const x = ((point.lng - minLng) / spanLng) * 100;
    const y = (1 - (point.lat - minLat) / spanLat) * 100;
    return `${x},${y}`;
  };
  return (
    <svg viewBox="-6 -6 112 112" className={`h-full w-full ${night ? "bg-[#10110e]" : "bg-[#e7e1d4]"}`} role="img" aria-label="Route sketch">
      {[20, 40, 60, 80].map((value) => (
        <g key={value} stroke={night ? "rgba(244,241,234,0.06)" : "rgba(22,23,18,0.08)"} strokeWidth="0.4">
          <line x1={value} y1="0" x2={value} y2="100" />
          <line x1="0" y1={value} x2="100" y2={value} />
        </g>
      ))}
      {lines.map((line) => (
        <polyline
          key={line.id}
          className="route-draw"
          points={line.points.map(xy).join(" ")}
          fill="none"
          stroke={line.faded ? "rgba(138,98,52,0.35)" : line.active ? "#8a6234" : "rgba(138,98,52,0.55)"}
          strokeWidth={line.active ? 1.7 : 1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {puck ? (
        <g transform={`translate(${xy(puck).split(",")[0]} ${xy(puck).split(",")[1]}) rotate(${puck.bearing}) scale(0.07)`} dangerouslySetInnerHTML={{ __html: vehicleShapes(mark ?? resolveVehicle({ mode: "driving", role: "private", stored: null }), puck.demo) }} />
      ) : null}
    </svg>
  );
}
