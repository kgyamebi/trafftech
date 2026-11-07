"use client";

import { useEffect, useState } from "react";
import { mergeDriveCookie, type DriverRole } from "@/domain/drive-prefs";
import type { TravelMode } from "@/domain/navigation";
import {
  bodyRole,
  cleanVehicleName,
  DRIVING_BODIES,
  PAINTS,
  parseVehicleStored,
  resolveVehicle,
  vehicleMarkup,
  type PaintId,
  type StripeId,
  type VehicleBody,
  type VehicleMark,
  type VehicleStored,
} from "@/domain/vehicle-look";

const KEY = "nokware-vehicle-look";

export function useVehicleLook(role: DriverRole) {
  const [stored, setStored] = useState<VehicleStored | null>(null);
  const [roleNow, setRoleNow] = useState(role);

  useEffect(() => {
    setStored(parseVehicleStored(window.localStorage.getItem(KEY)));
  }, []);

  useEffect(() => {
    setRoleNow(role);
  }, [role]);

  function commit(next: VehicleStored) {
    setStored(next);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  }

  function current(): VehicleStored {
    return stored ?? { trip: "role", paint: null, stripe: "red", name: "" };
  }

  return {
    stored,
    mark(mode: TravelMode): VehicleMark {
      return resolveVehicle({ mode, role: roleNow, stored });
    },
    choose(trip: VehicleBody | "role") {
      commit({ ...current(), trip });
    },
    paint(paint: PaintId) {
      commit({ ...current(), paint });
    },
    stripe(stripe: StripeId) {
      commit({ ...current(), stripe });
    },
    rename(name: string) {
      commit({ ...current(), name: cleanVehicleName(name) });
    },
    remember(body: VehicleBody) {
      const nextRole = bodyRole(body);
      if (!nextRole) return;
      setRoleNow(nextRole);
      mergeDriveCookie({ role: nextRole });
      commit({ ...current(), trip: "role" });
    },
  };
}

export function VehicleGlyph({ mark, bearing, demo, size = 52 }: { mark: VehicleMark; bearing: number; demo: boolean; size?: number }) {
  return (
    <span className="nk-vehicle" style={{ width: size, height: size * 1.4, transform: `rotate(${Math.round(bearing)}deg)` }} dangerouslySetInnerHTML={{ __html: vehicleMarkup(mark, demo) }} />
  );
}

export function VehiclePicker({
  mode,
  look,
}: {
  mode: TravelMode;
  look: ReturnType<typeof useVehicleLook>;
}) {
  const mark = look.mark(mode);
  const trip = look.stored?.trip ?? "role";
  const remembered = bodyRole(mark.body);
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <VehicleGlyph mark={mark} bearing={0} demo={false} size={42} />
        <div>
          <p className="text-sm font-semibold">{mark.label}{trip === "role" ? " · usual" : " · this trip"}</p>
          <p className="text-xs opacity-70">{mark.note}</p>
        </div>
      </div>
      {mode === "driving" ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={trip === "role" ? "btn" : "btn btn-ghost"} onClick={() => look.choose("role")}>Usual</button>
          {DRIVING_BODIES.map((body) => (
            <button key={body.id} type="button" className={trip === body.id ? "btn" : "btn btn-ghost"} aria-pressed={trip === body.id} onClick={() => look.choose(body.id)}>{body.label}</button>
          ))}
        </div>
      ) : (
        <p className="text-xs opacity-70">The {mode === "walking" ? "person" : "bicycle"} is drawn for this route. The vehicle you chose comes back when you drive.</p>
      )}
      <div className="flex flex-wrap gap-2" aria-label="Colour">
        {PAINTS.map((paint) => (
          <button
            key={paint.id}
            type="button"
            aria-label={paint.label}
            aria-pressed={look.stored?.paint === paint.id || (!look.stored?.paint && mark.paint === paint.hex)}
            className="h-7 w-7 rounded-full border border-ink/20"
            style={{ background: paint.hex }}
            onClick={() => look.paint(paint.id)}
          />
        ))}
      </div>
      {mark.body === "trotro" ? (
        <>
          <div className="flex flex-wrap gap-2">
            {(["red", "blue", "green", "yellow"] as StripeId[]).map((stripe) => (
              <button key={stripe} type="button" className={(look.stored?.stripe ?? "red") === stripe ? "btn" : "btn btn-ghost"} onClick={() => look.stripe(stripe)}>{stripe}</button>
            ))}
          </div>
          <label className="label">
            Name on the trotro
            <input className="field" maxLength={14} value={look.stored?.name ?? ""} onChange={(event) => look.rename(event.target.value)} placeholder="Optional, as painted on it" />
          </label>
        </>
      ) : null}
      {remembered && trip !== "role" ? (
        <button type="button" className="text-sm underline" onClick={() => look.remember(mark.body)}>Remember this as what I usually drive</button>
      ) : null}
    </div>
  );
}
