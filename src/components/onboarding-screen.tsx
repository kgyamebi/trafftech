"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { buildDemoFrames } from "@/domain/navigation";
import { ONBOARDING_STEPS, onboardingComplete } from "@/domain/onboarding";
import { completeOnboardingAction } from "@/server/actions";
import { SchematicMap } from "./nav/schematic";

export function OnboardingScreen({ replay = false }: { replay?: boolean }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const current = ONBOARDING_STEPS[step];

  function next() {
    setStep((value) => Math.min(ONBOARDING_STEPS.length - 1, value + 1));
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-5 py-6">
        <div className="flex items-center justify-between">
          <p className="display text-2xl italic">Nokware</p>
          <form action={completeOnboardingAction}>
            <button className="text-sm text-muted" type="submit">
              Skip demo
            </button>
          </form>
        </div>
        <div className="mt-6 h-px bg-line" aria-hidden>
          <div className="h-px bg-ink" style={{ width: `${((step + 1) / ONBOARDING_STEPS.length) * 100}%` }} />
        </div>
        <p className="eyebrow mt-6">{current.kicker}</p>
        <motion.div
          key={current.id}
          className="grid flex-1 content-center gap-6 py-8"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
        >
          {step === 0 ? <Welcome /> : null}
          {step === 1 ? <StatusDemo /> : null}
          {step === 2 ? <DriveDemo /> : null}
          {step === 3 ? <GarageDemo /> : null}
          {step === 4 ? <NoticeDemo /> : null}
          {step === 5 ? <ScoreDemo /> : null}
          {step === 6 ? <AiDemo /> : null}
          {step === 7 ? <Ready /> : null}
        </motion.div>
        <div className="flex items-center justify-between pb-4">
          <button type="button" className="text-sm text-muted" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Back
          </button>
          {step < ONBOARDING_STEPS.length - 1 ? (
            <button type="button" className="btn" onClick={next}>
              Continue
            </button>
          ) : replay ? (
            <a className="btn" href="/home">Open the map</a>
          ) : (
            <form action={completeOnboardingAction}>
              <button className="btn" type="submit" disabled={!onboardingComplete({ skipped: false, stepIndex: step })}>
                Let’s set up your vehicle
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Welcome() {
  return (
    <div>
      <div className="lane lane-dark mb-8 max-w-sm" aria-hidden />
      <h1 className="display text-6xl sm:text-7xl">Welcome to Nokware</h1>
      <p className="mt-4 max-w-md text-lg text-muted">Your intelligent driving companion. Truthful about the road, the car, and the notice in your pocket.</p>
    </div>
  );
}

function StatusDemo() {
  return (
    <div>
      <h1 className="display text-5xl">Know your status</h1>
      <p className="mt-3 max-w-md text-muted">Home answers one question first: are you all right to drive?</p>
      <p className="mt-8 text-xs text-muted">Example. Not your records.</p>
      <div className="mt-3 grid max-w-md grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-line bg-line">
        {[
          ["Score", "94"],
          ["Vehicle", "Good"],
          ["Traffic", "Clear"],
          ["Insurance", "Valid"],
        ].map(([k, v]) => (
          <div key={k} className="bg-raised px-4 py-4">
            <p className="text-xs text-muted">{k}</p>
            <p className="numeric mt-2 text-4xl">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DriveDemo() {
  const frames = useMemo(() => buildDemoFrames(), []);
  const [index, setIndex] = useState(0);
  const [play, setPlay] = useState(true);
  useEffect(() => {
    if (!play) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % frames.length), 1400);
    return () => window.clearInterval(timer);
  }, [play, frames.length]);
  const frame = frames[index];
  return (
    <div>
      <h1 className="display text-5xl">Let's see how Drive works.</h1>
      <p className="eyebrow mt-4">DEMO · not your GPS</p>
      <div className="mt-6 h-56 overflow-hidden rounded-[16px] border border-line">
        <SchematicMap
          night={false}
          puck={{ lat: frame.point.lat, lng: frame.point.lng, bearing: frame.bearing, demo: true }}
          lines={[
            ...(frame.fadedGeometry ? [{ id: "old", points: frame.fadedGeometry, active: false, faded: true }] : []),
            { id: "now", points: frame.geometry, active: true },
          ]}
        />
      </div>
      <button type="button" onClick={() => setPlay((value) => !value)} className="mt-4 block w-full max-w-sm rounded-[16px] bg-drive px-6 py-6 text-left text-drive-fg">
        <p className="numeric text-6xl">{frame.speedKph}</p>
        <p className="mt-2 text-sm text-drive-fg/70">km/h · scripted limit {frame.limit.kph}</p>
        {frame.upcoming ? <p className="mt-3 text-lg text-[#f0d7a8]">LIMIT {frame.upcoming.kph} AHEAD · {frame.upcoming.metres} m</p> : null}
        {frame.alert ? <p className="mt-2 text-lg">{frame.alert.title}</p> : null}
        <p className="mt-3 text-sm leading-relaxed text-drive-fg/75">{frame.narration}</p>
        <p className="mt-3 text-xs text-drive-fg/50">{play ? "Tap to pause" : "Tap to play"} · this is not saved</p>
      </button>
      <p className="mt-4 max-w-md text-sm text-muted">Nokware shows what is changing around the drive. It will not help you hide from enforcement.</p>
    </div>
  );
}

function GarageDemo() {
  return (
    <div>
      <h1 className="display text-5xl">Know your vehicle</h1>
      <ul className="mt-6 max-w-md divide-y divide-line border-y border-line">
        {["Insurance · valid", "Roadworthiness · a date is coming", "Registration · valid", "Licence · with you"].map((row) => (
          <li key={row} className="py-3">{row}</li>
        ))}
      </ul>
    </div>
  );
}

function NoticeDemo() {
  return (
    <div>
      <h1 className="display text-5xl">Never miss a traffic event</h1>
      <article className="card mt-6 max-w-md px-5 py-5">
        <p className="eyebrow">Simulated · not saved</p>
        <h2 className="mt-2 text-2xl">Speed violation</h2>
        <p className="mt-2 text-sm text-muted">28 October · Accra–Tema Motorway</p>
        <p className="numeric mt-4 text-5xl">GH₵240</p>
        <p className="mt-2 text-sm">13 days on a confirmed date would sit here. This one is only a demonstration.</p>
      </article>
    </div>
  );
}

function ScoreDemo() {
  return (
    <div>
      <h1 className="display text-5xl">Understand your driving</h1>
      <p className="numeric mt-6 text-8xl">94</p>
      <p className="mt-2 text-muted">Excellent, when the samples exist. If they don’t, Nokware says so.</p>
    </div>
  );
}

function AiDemo() {
  return (
    <div>
      <h1 className="display text-5xl">A copilot with a paper trail</h1>
      <div className="mt-6 max-w-md border-l-2 border-bronze pl-4 text-sm leading-relaxed">
        <p className="eyebrow">Fact</p>
        <p className="mt-2">Your score moved because the components moved. The assistant is not allowed to invent the reason.</p>
      </div>
    </div>
  );
}

function Ready() {
  return (
    <div>
      <h1 className="display text-6xl">You’re ready.</h1>
      <p className="mt-4 max-w-md text-lg text-muted">Next we add your vehicle. The demonstration you just saw is not stored as your record.</p>
    </div>
  );
}
