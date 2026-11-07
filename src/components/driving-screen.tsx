"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { alertSpeech, briefScript, greetingLine, languageNote, plainAlert, slowDownSpeech, speedBoard } from "@/domain/companion";
import { accraParts } from "@/domain/dates";
import type { DrivePrefs, Language } from "@/domain/drive-prefs";
import { driveVoice, exchange, hearSpeed, wayPhrase } from "@/domain/languages";
import { ROLES } from "@/domain/drive-prefs";
import { openingCard } from "@/domain/intelligence";
import type { VoiceMode } from "@/domain/navigation";
import type { ProtectionStatus } from "@/domain/protection";
import type { Workspace } from "@/domain/types";
import type { useDrive } from "./nav/use-drive";
import { speak } from "./speak";

const LIMITS = [30, 50, 90, 100];

export function DrivingScreen({
  nav,
  prefs,
}: {
  nav: ReturnType<typeof useDrive>;
  prefs: DrivePrefs;
}) {
  const [voice, setVoice] = useState(prefs.voice);
  const [showCard, setShowCard] = useState(false);
  const focus = nav.ws.attention.find((item) => item.severity === "urgent" || item.severity === "attention")
    ?? nav.ws.attention.find((item) => item.severity === "info")
    ?? null;
  const card = openingCard({
    heroState: nav.ws.hero.state,
    heroTitle: nav.ws.hero.title,
    greeting: nav.ws.greeting,
    vehicle: nav.ws.activeVehicle ? { id: nav.ws.activeVehicle.id, standing: nav.ws.activeVehicle.standing } : null,
    documents: nav.ws.documents,
    activeViolations: nav.ws.totals.activeViolations,
    score: nav.ws.score.overall,
    focus,
    demo: nav.ws.mode === "demo",
  });
  const board = speedBoard({
    source: nav.demoOn ? "demo" : nav.speedKnown && nav.fix ? "gps" : "none",
    speedKph: nav.demoOn ? nav.speed : nav.speedKnown ? nav.speed : null,
    accuracyM: nav.demoOn ? null : nav.fix?.accuracy ?? null,
    limitKph: nav.limit.kph,
    limitOrigin: nav.limit.source === "user_declared" || nav.limit.source === "demo_script" || nav.limit.source === "openstreetmap" ? nav.limit.source : "unavailable",
  });
  const alertTitle = prefs.easy ? plainAlert(focus?.title ?? null) : focus?.title ?? null;
  const spokenAlert = alertSpeech(focus?.title ?? null);
  const hour = accraParts(new Date()).hour;
  const talk = exchange(prefs.lang, hour);
  const brief = briefScript({
    greeting: talk ?? greetingLineFor(nav.ws, prefs),
    papersClear: card.checks != null,
    openNotices: nav.ws.totals.activeViolations,
    focusTitle: focus?.title ?? null,
  }).join(" ");
  const direction = wayPhrase(prefs.lang, nav.instruction?.text ?? "") ?? nav.instruction?.text ?? "No route yet.";
  const moving = nav.moving;
  const commercial = prefs.role !== "private";
  const note = commercial ? null : languageNote(prefs.lang);
  const warning = slowDownSpeech(board, prefs.lang);
  const shownStatus = statusLabel(prefs.lang, board.status, board.speed != null);
  const limitLine = nav.limit.source === "openstreetmap"
    ? "This follows the mapped limit for the road you are on. The posted sign controls."
    : nav.limit.source === "user_declared"
      ? nav.roadName
        ? `You set this limit for ${nav.roadName}. The posted sign controls.`
        : "You set this limit for the road you are on. The posted sign controls."
      : nav.consent === "yes"
        ? "No mapped limit on this road. Choose the sign you see. It is saved for this road."
        : "Turn on GPS. The limit follows the road when a map tag exists.";

  useEffect(() => {
    if (!nav.consentReady || nav.consent !== "unknown" || nav.demoOn) return;
    nav.setExplain(true);
  }, [nav.consentReady, nav.consent, nav.demoOn, nav.setExplain]);

  useEffect(() => {
    if (board.status !== "ABOVE LIMIT") return;
    if (!warning || (voice !== "on" && voice !== "important")) return;
    speak(warning, prefs.lang);
  }, [board.status, warning, voice, prefs.lang]);

  function chooseVoice(mode: VoiceMode) {
    setVoice(mode);
    nav.setVoiceMode(mode);
  }

  const roleLabel = ROLES.find((role) => role.id === prefs.role)?.label ?? "Work";

  return (
    <section className={`cockpit ${nav.night ? "is-night" : ""}`} aria-label="Driving screen">
      <div className="cockpit-frame">
        <div className="cockpit-main">
          <header className="cockpit-kicker">
            <p className="display cockpit-mark">Nokware</p>
            <p className="status-pill" data-state={board.status}>{shownStatus}</p>
          </header>
          {talk ? <p className="cockpit-talk">{talk}</p> : null}
          <div className="dial-stage">
            <article className="dial">
              <p className="eyebrow">{board.caption}</p>
              {board.speed == null ? <p className="dial-blank" aria-label="No reading" /> : <p className="dial-figure">{board.speed}</p>}
              <p className="dial-unit">km/h</p>
            </article>
            <article className="dial dial-limit">
              <p className="eyebrow">{board.limitLabel}</p>
              {board.limit == null ? <p className="dial-blank" aria-label="No limit" /> : <p className="dial-figure">{board.limit}</p>}
              <p className="dial-unit">km/h</p>
            </article>
          </div>
          <p className="cockpit-line">{nav.demoOn ? board.line : nav.gpsLine}</p>
          <div className="fact-row">
            <article className="fact">
              <p className="eyebrow">Route</p>
              <p>{direction}</p>
            </article>
            <article className="fact">
              <p className="eyebrow">Notice</p>
              {alertTitle ? (
                <>
                  <p>{alertTitle}</p>
                  {spokenAlert ? <button type="button" className="cockpit-inline" onClick={() => speak(spokenAlert, prefs.lang)}>Listen</button> : null}
                </>
              ) : (
                <p>None saved.</p>
              )}
            </article>
          </div>
          {nav.upcoming ? (
            <article className="fact fact-wide">
              <p className="eyebrow">Limit change ahead</p>
              <p>{nav.upcoming.kph} km/h · {nav.upcoming.metres} m</p>
              <p className="cockpit-line">{nav.upcoming.note}</p>
            </article>
          ) : null}
          {nav.ws.mode === "demo" && nav.speedKnown ? <p className="cockpit-line">DEMO account. This GPS speed is not saved to the score.</p> : null}
          {note ? <p className="cockpit-line">{note}</p> : null}
        </div>

        <aside className="cockpit-side">
          <section className="panel" aria-label="Limit you are following">
            <p className="eyebrow">The sign you see</p>
            {nav.limit.source === "openstreetmap" || nav.demoOn ? null : (
              <div className="segment">
                {LIMITS.map((kph) => (
                  <button key={kph} type="button" aria-pressed={nav.declared === kph} onClick={() => nav.setLimit(kph)}>{kph}</button>
                ))}
              </div>
            )}
            <p className="panel-note">{limitLine}</p>
          </section>

          {!moving && !commercial ? (
            <section className="panel" aria-label="Voice">
              <p className="eyebrow">Voice</p>
              <div className="segment">
                {([
                  ["off", "Off", "Voice off"],
                  ["on", "On", "Voice on"],
                  ["important", "Important", "Important only"],
                  ["navigation", "Navigation", "Navigation only"],
                ] as const).map(([mode, label, full]) => (
                  <button key={mode} type="button" aria-pressed={voice === mode} aria-label={full} onClick={() => chooseVoice(mode)}>{label}</button>
                ))}
              </div>
            </section>
          ) : null}

          <div className="action-stack">
            <button type="button" className="cockpit-primary" onClick={() => speak(heardSpeed(prefs.lang, hour, board), prefs.lang)}>Hear speed</button>
            {moving || nav.consent === "yes" || nav.demoOn ? null : (
              <button type="button" className="cockpit-ghost" onClick={() => nav.setExplain(true)}>Use GPS speed</button>
            )}
            <div className="action-pair">
              {moving ? null : <button type="button" className="cockpit-ghost" onClick={() => speak(brief, prefs.lang)}>Listen to brief</button>}
              <button type="button" className="cockpit-ghost" onClick={() => setShowCard(true)}>Emergency</button>
            </div>
            {moving || commercial ? null : (
              <div className="link-row">
                <Link className="cockpit-ghost" href="/home?map=1">Map</Link>
                <Link className="cockpit-ghost" href="/protect">Protection</Link>
                <Link className="cockpit-ghost" href="/work">{roleLabel}</Link>
              </div>
            )}
          </div>
        </aside>
      </div>

      {nav.explain ? (
        <div className="cockpit-backdrop" role="presentation" onClick={nav.declineLocation}>
          <div className="cockpit-dialog" role="dialog" aria-label="GPS speed" onClick={(event) => event.stopPropagation()}>
            <p className="eyebrow">GPS speed</p>
            <p className="cockpit-dialog-title">Read speed from this phone</p>
            <p>This phone can show GPS speed. When the fix is steady, you can read it in place of a broken speedometer. It is not a certified vehicle speedometer. You can say no.</p>
            <div className="dialog-actions">
              <button type="button" className="cockpit-primary" onClick={nav.allowLocation}>Allow GPS speed</button>
              <button type="button" className="cockpit-ghost" onClick={nav.declineLocation}>Not now</button>
            </div>
          </div>
        </div>
      ) : null}

      {showCard ? <EmergencySheet ws={nav.ws} onClose={() => setShowCard(false)} /> : null}
    </section>
  );
}

function heardSpeed(lang: Language, hour: number, board: { speed: number | null; limit: number | null; status: ProtectionStatus; line: string }): string {
  if (board.speed == null) return board.line;
  return hearSpeed(lang, hour, board.speed, board.limit, board.status);
}

function statusLabel(lang: Language, status: ProtectionStatus, hasSpeed: boolean): string {
  if (status === "UNKNOWN") {
    if (lang !== "en") return driveVoice(lang).unknown ?? (hasSpeed ? "No limit" : "No reading");
    return hasSpeed ? "No limit" : "No reading";
  }
  if (lang === "en") return status;
  const pack = driveVoice(lang);
  if (status === "SAFE") return pack.safe;
  if (status === "APPROACHING LIMIT") return pack.approaching ?? status;
  if (status === "ABOVE LIMIT") return pack.above ?? status;
  return pack.unknown ?? status;
}

function greetingLineFor(ws: Workspace, prefs: DrivePrefs): string {
  if (prefs.lang === "en") return ws.greeting;
  const line = greetingLine(prefs.lang, accraParts(new Date()).hour);
  return line.fallback ? ws.greeting : line.text;
}

function EmergencySheet({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
  const card = ws.emergency;
  const text = [
    `Driver ${card.driverName}.`,
    card.plate ? `Vehicle ${card.plate}.` : "No vehicle saved.",
    card.contactName ? `Emergency contact ${card.contactName}.` : "No emergency contact saved.",
    card.contactPhone ? `Phone ${card.contactPhone}.` : "",
    card.insurerName ? `Insurer ${card.insurerName}.` : "",
    card.bloodGroup ? `Blood group entered: ${card.bloodGroup}.` : "",
    card.medicalNote ? card.medicalNote : "",
  ].filter(Boolean).join(" ");

  useEffect(() => {
    try {
      localStorage.setItem("nokware-emergency", JSON.stringify(card));
    } catch {
      /* private mode */
    }
  }, [card]);

  return (
    <div className="cockpit-backdrop" role="presentation" onClick={onClose}>
      <div className="cockpit-dialog" role="dialog" aria-label="Emergency information" onClick={(event) => event.stopPropagation()}>
        <p className="eyebrow">Emergency</p>
        <p className="cockpit-dialog-title">{card.driverName}</p>
        <dl className="emergency-list">
          <div><dt>Vehicle</dt><dd>{card.plate ? `${card.plate}${card.vehicle ? ` · ${card.vehicle}` : ""}` : "No vehicle saved."}</dd></div>
          <div><dt>Contact</dt><dd>{card.contactName || "No emergency contact saved."} {card.contactPhone}</dd></div>
          <div><dt>Insurer</dt><dd>{card.insurerName || "No insurer saved."} {card.insurerPhone}</dd></div>
          {card.bloodGroup ? <div><dt>Blood group</dt><dd>{card.bloodGroup}. You entered this.</dd></div> : null}
          {card.medicalNote ? <div><dt>Note</dt><dd>{card.medicalNote}</dd></div> : null}
        </dl>
        <p className="panel-note">Saved on this phone after you open this card. {ws.mode === "demo" ? "DEMO. Not your records." : "You typed these details."}</p>
        <div className="dialog-actions">
          <button type="button" className="cockpit-primary" onClick={() => speak(text, "en")}>Listen</button>
          <Link className="cockpit-ghost" href="/emergency">Edit</Link>
          <button type="button" className="cockpit-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
