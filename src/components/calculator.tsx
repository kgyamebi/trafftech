"use client";

import { useState } from "react";
import { ghs } from "@/domain/dates";
import { estimateAutomatedFine, estimateLateAddition, estimateSpeedFine } from "@/domain/fines";

export function FineCalculator() {
  const [mode, setMode] = useState<"speed" | "other">("speed");
  const [over, setOver] = useState(12);
  const [count, setCount] = useState(1);
  const [days, setDays] = useState(0);
  const estimate = mode === "speed" ? estimateSpeedFine(over) : estimateAutomatedFine(count);
  const late = estimate.amountGhs == null ? null : estimateLateAddition(estimate.amountGhs, days);
  return (
    <div className="grid gap-5">
      <div className="flex gap-2">
        <button type="button" className={mode === "speed" ? "btn" : "btn btn-ghost"} onClick={() => setMode("speed")}>Speeding</button>
        <button type="button" className={mode === "other" ? "btn" : "btn btn-ghost"} onClick={() => setMode("other")}>Other automated</button>
      </div>
      {mode === "speed" ? (
        <label className="label">
          Kilometres per hour over the limit
          <input className="field" inputMode="numeric" value={over} onChange={(e) => setOver(Number(e.target.value) || 0)} />
        </label>
      ) : (
        <label className="label">
          Which offence this is on the reported scale
          <input className="field" inputMode="numeric" value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} />
        </label>
      )}
      <label className="label">
        Days after a 14-day window, if you want the published 1% illustration
        <input className="field" inputMode="numeric" value={days} onChange={(e) => setDays(Math.max(0, Number(e.target.value) || 0))} />
      </label>
      <div>
        <p className="eyebrow">Estimate · not a bill</p>
        <p className="numeric mt-2 text-6xl">{estimate.amountGhs == null ? "—" : ghs(estimate.amountGhs)}</p>
        <p className="mt-2 text-sm">{estimate.band}</p>
        {late ? <p className="mt-2 text-sm text-muted">Illustrated addition {ghs(late)}. Total illustration {ghs((estimate.amountGhs ?? 0) + late)}.</p> : null}
        <p className="mt-4 text-sm leading-relaxed text-muted">{estimate.basis}</p>
      </div>
    </div>
  );
}
