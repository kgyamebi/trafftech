"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Briefcase, Gauge, GraduationCap, House, Layers, LocateFixed, Mic, Minus, Pause, Plus, Search, Square, Star, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DrivePrefs } from "@/domain/drive-prefs";
import { driverHealth, driverStatusChip, oneUpcoming, openingCard } from "@/domain/intelligence";
import { filterTrips, formatDistance, formatDuration, bearingDeg, haversine, type TravelMode } from "@/domain/navigation";
import type { PlaceView, Workspace } from "@/domain/types";
import { exitDemoAction } from "@/server/actions";
import { DrivingScreen } from "./driving-screen";
import { MapCanvas, type MapHandle } from "./nav/map-canvas";
import { SchematicMap } from "./nav/schematic";
import { useDrive } from "./nav/use-drive";

const VIEWS = [
  { id: "close", label: "Close", zoom: 18, ahead: 90 },
  { id: "street", label: "Street", zoom: 16, ahead: 35 },
  { id: "area", label: "Area", zoom: 13, ahead: 0 },
  { id: "far", label: "Far", zoom: 9, ahead: 0 },
] as const;

type MapViewId = (typeof VIEWS)[number]["id"];

const LIMITS = [
  { kph: 30, label: "Activity" },
  { kph: 50, label: "Urban" },
  { kph: 90, label: "Outside urban" },
  { kph: 100, label: "Motorway" },
];

const LIBRARY = [
  { href: "/now", label: "Driving screen" },
  { href: "/protect", label: "Protection" },
  { href: "/work", label: "Work" },
  { href: "/emergency", label: "Emergency" },
  { href: "/score", label: "Driver score" },
  { href: "/vehicle", label: "Vehicle" },
  { href: "/documents", label: "Documents" },
  { href: "/traffic", label: "Violations" },
  { href: "/ask", label: "Driver intelligence" },
  { href: "/brief", label: "Daily brief" },
  { href: "/services", label: "Services" },
  { href: "/fleet", label: "Fleet" },
  { href: "/notifications", label: "Notifications" },
  { href: "/settings", label: "Settings" },
  { href: "/profile", label: "Profile" },
];

const NEARBY = [
  ["Hospital", "hospital"],
  ["Pharmacy", "pharmacy"],
  ["Fuel", "fuel station"],
  ["Police", "police"],
  ["School", "school"],
  ["Market", "market"],
  ["Bank", "bank"],
  ["Restaurant", "restaurant"],
] as const;

const SEARCH_SHORTCUTS = [
  ["Airports", "airport"],
  ["Hospitals", "hospital"],
  ["Petrol", "fuel station"],
  ["Universities", "university"],
  ["Restaurants", "restaurant"],
  ["Landmarks", "landmark"],
  ["Businesses", "shop"],
] as const;

export function DriveScreen({ ws, prefs, screen = "map" }: { ws: Workspace; prefs: DrivePrefs; screen?: "map" | "now" }) {
  const nav = useDrive(ws, prefs.voice);
  const reduce = useReducedMotion();
  const mapRef = useRef<MapHandle>(null);
  const [view, setView] = useState<MapViewId>("street");
  const [camera, setCamera] = useState({ zoom: 16, ahead: 0, token: 0, fit: false });
  const moving = (nav.speed ?? 0) > 8 || nav.demoOn;
  const chosen = VIEWS.find((item) => item.id === view) ?? VIEWS[1];
  const ahead = chosen.ahead > 0 && moving ? chosen.ahead : 0;
  const tone = "bg-paper text-ink";
  const quiet = "text-muted";
  const browsing = nav.phase === "browse" || nav.phase === "preview";
  const chip = driverStatusChip({
    heroState: nav.ws.hero.state,
    heroTitle: nav.ws.hero.title,
    vehicle: nav.ws.activeVehicle ? { id: nav.ws.activeVehicle.id, standingLabel: nav.ws.activeVehicle.standingLabel } : null,
    focus: nav.ws.attention.find((item) => item.severity === "urgent" || item.severity === "attention") ?? null,
  });
  const task = oneUpcoming(nav.ws.attention, nav.ws.insights[0]?.text ?? null);
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") nav.setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav.setSearchOpen]);

  function chooseView(id: MapViewId) {
    const next = VIEWS.find((item) => item.id === id) ?? VIEWS[1];
    const look = next.ahead > 0 && moving ? next.ahead : 0;
    setView(id);
    setCamera((current) => ({ zoom: next.zoom, ahead: look, token: current.token + 1, fit: id === "far" }));
    if (id === "close" || id === "street") nav.setFollow(true);
  }

  if (screen === "now") return <DrivingScreen nav={nav} prefs={prefs} />;

  return (
    <div className="drive-root">
      <div className="drive-stage">
        {nav.mapFailed ? (
          <SchematicMap night={nav.night} lines={nav.lines} puck={nav.puck} />
        ) : (
          <MapCanvas
            key={nav.mapKey}
            ref={mapRef}
            night={nav.night}
            center={nav.center}
            zoom={camera.zoom}
            aheadM={ahead}
            cameraToken={camera.token}
            cameraFit={camera.fit}
            follow={nav.follow && (nav.phase === "navigating" || nav.phase === "recalculating")}
            fitToken={nav.fitToken}
            puck={nav.puck}
            lines={nav.lines}
            places={nav.showPlaces ? nav.ws.places.map((place) => ({ id: place.id, name: place.name, lat: place.lat, lng: place.lng })) : []}
            pin={nav.pin}
            onPick={(point) => void nav.pickPoint(point)}
            onPlace={nav.pickSaved}
            onUserMove={() => nav.setFollow(false)}
            onFail={nav.failMap}
          />
        )}

        {browsing ? (
          <div className="drive-top flex gap-2">
            <button type="button" onClick={nav.openSearch} className={`drive-capsule ${tone}`}>
              <Search size={16} />
              <span className="truncate">{nav.destination?.name ?? "Where are you going?"}</span>
            </button>
            <Link href="/now" className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${tone}`} aria-label="Driving screen">
              <Gauge size={18} />
            </Link>
          </div>
        ) : null}

        {nav.phase === "navigating" || nav.phase === "recalculating" ? (
          <div className={`absolute left-3 right-16 top-3 z-20 rounded-[16px] px-4 py-4 ${tone} sm:right-24`}>
            <p className="numeric text-5xl sm:text-6xl">{nav.instruction?.text ?? "Continue"}</p>
            <p className={`mt-2 text-lg ${quiet}`}>{nav.instruction ? formatDistance(nav.instruction.metres) : ""}</p>
            {nav.frame?.narration ? <p className={`mt-2 text-sm ${quiet}`}>{nav.frame.narration}</p> : null}
          </div>
        ) : null}

        {nav.banner ? <p className={`absolute left-3 right-3 top-36 z-20 rounded-[12px] px-3 py-2 text-sm ${tone}`}>{nav.banner}</p> : null}
        {nav.where && nav.where.startsWith("GPS") ? <p className={`absolute left-3 right-3 z-20 rounded-[12px] px-3 py-2 text-sm ${tone} ${nav.phase === "navigating" ? "top-52" : "top-48"}`}>{nav.where}</p> : null}
        {!nav.online ? (
          <p className={`absolute left-3 right-3 z-20 rounded-[12px] px-3 py-2 text-sm ${tone} bottom-36`}>
            Connection lost. Navigation may use the route already on this phone.
            {nav.freshness ? ` ${nav.freshness}.` : ""}
          </p>
        ) : null}

        {nav.mapFailed ? null : (
          <div className={`absolute left-3 z-20 flex gap-1 ${browsing ? "top-24" : "top-44"}`} aria-label="Map view">
            {VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={view === item.id}
                className={`h-9 rounded-full px-3 text-xs font-semibold shadow-soft ${view === item.id ? "bg-ink text-paper" : "bg-paper text-ink"}`}
                onClick={() => chooseView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        <div className={`absolute right-3 z-20 grid gap-2 ${browsing ? "top-24" : "top-44"}`}>
          {!nav.follow ? (
            <IconButton label="Recenter" onClick={() => nav.setFollow(true)} night={nav.night}><LocateFixed size={18} /></IconButton>
          ) : null}
          {nav.mapFailed ? null : (
            <>
              <IconButton label="Zoom in" onClick={() => mapRef.current?.zoomIn()} night={nav.night}><Plus size={18} /></IconButton>
              <IconButton label="Zoom out" onClick={() => mapRef.current?.zoomOut()} night={nav.night}><Minus size={18} /></IconButton>
            </>
          )}
          <IconButton label="Map layers" onClick={() => nav.setLayersOpen(!nav.layersOpen)} night={nav.night}><Layers size={18} /></IconButton>
        </div>

        {nav.layersOpen ? (
          <div className={`absolute right-16 top-40 z-20 w-52 rounded-[14px] p-3 text-sm ${tone}`}>
            <p className="eyebrow">Layers</p>
            <label className="mt-3 flex items-center justify-between gap-3">
              Saved places
              <input type="checkbox" checked={nav.showPlaces} onChange={(event) => nav.setShowPlaces(event.target.checked)} />
            </label>
            <p className={`mt-3 ${quiet}`}>Traffic is not connected, so that layer stays off.</p>
          </div>
        ) : null}

        {nav.phase === "preview" ? (
          <div className="drive-route">
            <RouteCard nav={nav} chip={chip} />
          </div>
        ) : null}

        {nav.pin && nav.phase !== "preview" && nav.phase !== "summary" && nav.phase !== "offer" ? (
          <div className={`drive-pin ${nav.phase === "navigating" || nav.phase === "recalculating" ? "drive-pin-float" : ""}`}>
            <PinCard
              nav={nav}
              onLook={() => {
                if (!nav.pin) return;
                nav.setFollow(false);
                mapRef.current?.show(nav.pin, 18);
                setView("close");
              }}
            />
          </div>
        ) : null}

        {nav.phase === "offer" && nav.offer ? (
          <div className={`absolute bottom-28 left-3 right-3 z-30 rounded-[16px] p-4 ${tone}`}>
            <p className="eyebrow">New route</p>
            <p className="mt-2 text-2xl">{nav.offer.savesMin > 0 ? `Saves ${nav.offer.savesMin} min` : "Another route is ready"}</p>
            <p className={`mt-1 text-sm ${quiet}`}>{nav.trafficNote}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" className="drive-action" onClick={nav.acceptOffer}>Use route</button>
              <button type="button" className="drive-quiet" onClick={nav.keepRoute}>Keep this one</button>
            </div>
          </div>
        ) : null}

        {nav.explain ? (
          <div className="absolute inset-0 z-40 grid place-items-center bg-black/45 p-5">
            <div className={`max-w-sm rounded-[16px] p-5 ${nav.night ? "bg-[#171814] text-drive-fg" : "bg-paper text-ink"}`}>
              <p className="display text-4xl">Location</p>
              <p className="mt-3 text-sm leading-relaxed">Nokware uses your location to provide navigation, route guidance and driving insights.</p>
              {nav.ws.mode === "demo" ? (
                <p className="mt-3 text-sm">The demo does not request GPS.</p>
              ) : (
                <div className="mt-5 flex gap-2">
                  <button type="button" className="drive-action" onClick={nav.allowLocation}>Allow location</button>
                  <button type="button" className="drive-quiet" onClick={nav.declineLocation}>Not now</button>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {nav.failure ? (
          <div className="absolute inset-x-4 top-24 z-30 mx-auto max-w-sm rounded-[16px] bg-paper p-5 text-ink">
            <p className="text-2xl">{nav.failure.title}</p>
            <p className="mt-2 text-sm text-muted">{nav.failure.detail}</p>
            <div className="mt-4 flex gap-2">
              {nav.providerOff ? null : <button type="button" className="drive-action" onClick={nav.retryMap}>Retry</button>}
              <button type="button" className="drive-quiet" onClick={nav.playDemo}>Play the demo drive</button>
            </div>
          </div>
        ) : null}

        {nav.searchOpen ? (
          <div className="drive-search-panel">
            <div className="mb-3 flex items-center justify-between">
              <p className="display text-3xl italic">Nokware</p>
              <button type="button" aria-label="Close search" onClick={() => nav.setSearchOpen(false)}><X size={18} /></button>
            </div>
            <SearchBody nav={nav} paper autoFocus />
          </div>
        ) : null}

        {nav.phase === "summary" && nav.summary ? <SummaryCard nav={nav} /> : null}

        {nav.phase !== "preview" && nav.phase !== "summary" && !(nav.pin && nav.phase === "browse") ? (
          <motion.section
            className={`drive-sheet ${tone}`}
            animate={{ height: nav.sheet === "collapsed" ? (browsing ? (card.checks ? 300 : 228) : 120) : nav.sheet === "half" ? "42%" : "78%" }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 34 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.08}
            onDragEnd={(_, info) => {
              if (info.offset.y < -40) nav.setSheet(nav.sheet === "collapsed" ? "half" : "full");
              else if (info.offset.y > 40) nav.setSheet(nav.sheet === "full" ? "half" : "collapsed");
            }}
          >
            <button type="button" className="mx-auto mt-2 block h-1.5 w-10 rounded-full bg-current opacity-30" aria-label="Expand driving information" onClick={() => nav.setSheet(nav.sheet === "full" ? "collapsed" : nav.sheet === "collapsed" ? "half" : "full")} />
            <div className="h-[calc(100%-16px)] overflow-y-auto px-4 pb-5">
              <SheetBody nav={nav} chip={chip} task={task} card={card} />
            </div>
          </motion.section>
        ) : null}
      </div>
    </div>
  );
}

function compass(bearing: number) {
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
  return names[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

function PinCard({ nav, onLook }: { nav: ReturnType<typeof useDrive>; onLook: () => void }) {
  const [saving, setSaving] = useState(false);
  const place = nav.pinPlace;
  const away = nav.pin && nav.fix ? haversine(nav.fix, nav.pin) : null;
  const heading = nav.pin && nav.fix ? compass(bearingDeg(nav.fix, nav.pin)) : null;
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow opacity-60">{place?.kind ?? "Place"} · OpenStreetMap</p>
          <h2 className="mt-1 text-2xl leading-tight">{place?.name ?? "Dropped pin"}</h2>
        </div>
        <button type="button" aria-label="Close place" onClick={nav.clearPin}><X size={18} /></button>
      </div>
      <p className="mt-2 text-sm opacity-70">{place?.address}</p>
      {away != null && heading ? (
        <p className="mt-1 text-sm">{formatDistance(away)} {heading} of you. Calculated from this phone&apos;s GPS.</p>
      ) : (
        <p className="mt-1 text-sm opacity-60">Distance appears when this phone has a GPS fix.</p>
      )}
      {place?.limitKph != null ? <p className="mt-2 text-sm">Mapped limit {place.limitKph}. The posted sign controls.</p> : null}
      {place?.hours ? <p className="mt-2 text-sm">Mapped hours: {place.hours}. This is not a live open or closed status.</p> : null}
      {place?.phone ? <a className="mt-2 block text-sm underline" href={`tel:${place.phone.replace(/[^\d+]/g, "")}`}>Call {place.phone}</a> : null}
      {place?.website ? <a className="mt-1 block truncate text-sm underline" href={place.website} target="_blank" rel="noreferrer">Mapped website</a> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="drive-action" onClick={nav.directionsToPin}>Directions</button>
        <button type="button" className="drive-quiet" onClick={() => void nav.departFromPin()}>From here</button>
        <button type="button" className="drive-quiet" onClick={() => void nav.sharePin()}>Share</button>
        <button type="button" className="drive-quiet" aria-expanded={saving} onClick={() => setSaving((open) => !open)}>Save</button>
        <button type="button" className="drive-quiet" onClick={onLook}>Look closer</button>
      </div>
      {saving ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {(["home", "work", "school", "favourite"] as const).map((slot) => (
            <button key={slot} type="button" className="rounded-full border border-current/15 px-3 py-1 text-sm capitalize" onClick={() => void nav.savePin(slot)}>{slot}</button>
          ))}
        </div>
      ) : null}
      {nav.pin ? <p className="mt-3 text-xs opacity-60">{nav.pin.lat.toFixed(5)}, {nav.pin.lng.toFixed(5)}</p> : null}
      {nav.pinBusy ? <p className="mt-2 text-sm opacity-60">Looking up this place…</p> : null}
      {nav.pinNote ? <p className="mt-2 text-sm">{nav.pinNote}</p> : null}
      <p className="eyebrow mt-4 opacity-60">Nearby</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {NEARBY.map(([label, query]) => (
          <button key={query} type="button" className="rounded-full border border-current/15 px-3 py-1 text-sm" onClick={() => void nav.findNearby(query)}>{label}</button>
        ))}
      </div>
      {nav.nearbyBusy ? <p className="mt-2 text-sm opacity-60">Searching OpenStreetMap nearby…</p> : null}
      <ul className="mt-2 grid gap-1">
        {nav.nearby.map((hit) => (
          <li key={hit.id}>
            <button type="button" className="block w-full rounded-[12px] px-2 py-2 text-left hover:bg-black/5" onClick={() => void nav.pickPoint({ lat: hit.lat, lng: hit.lng }, { name: hit.name, address: hit.address })}>
              <span className="block">{hit.name}</span>
              <span className="block text-sm opacity-60">{hit.distanceM != null ? `${formatDistance(hit.distanceM)} · OpenStreetMap` : hit.address}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs opacity-60">A name, phone, website, hours or speed appears only when OpenStreetMap has it. Nothing here is guessed.</p>
    </div>
  );
}

function IconButton({ label, onClick, night, children }: { label: string; onClick: () => void; night: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="grid h-11 w-11 place-items-center rounded-[12px] bg-paper text-ink shadow-soft">
      {children}
    </button>
  );
}

function SpeedFigure({ value }: { value: number }) {
  const shown = useRef(value);
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const from = shown.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 280);
      const next = Math.round(from + (value - from) * t);
      shown.current = next;
      setDisplay(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{display}</>;
}

function statusColor(status: string) {
  if (status === "OVER") return "text-[#9a3b32]";
  if (status === "AT LIMIT") return "text-[#8a5610]";
  if (status === "SAFE") return "text-[#17653e]";
  return "text-current opacity-60";
}

function Instrument({ nav }: { nav: ReturnType<typeof useDrive> }) {
  return (
    <div>
      <p className="eyebrow text-current/50">Current speed</p>
      <p className="numeric text-7xl"><SpeedFigure value={nav.speed} /></p>
      <p className="mt-1 text-sm opacity-70">km/h</p>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <p className="eyebrow text-current/50">Applicable limit</p>
          <p className="mt-1 text-2xl">{nav.limit.kph == null ? "—" : `${nav.limit.kph}`}</p>
        </div>
        <div>
          <p className="eyebrow text-current/50">Status</p>
          <p className={`mt-1 text-2xl ${statusColor(nav.status)}`}>{nav.status === "UNKNOWN" ? "—" : nav.status}</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed opacity-60">{nav.limit.note}</p>
      {nav.upcoming ? <p className="mt-3 text-sm">Limit {nav.upcoming.kph} ahead · {formatDistance(nav.upcoming.metres)}. {nav.upcoming.note}</p> : null}
      {nav.etaMin != null && nav.phase !== "browse" ? (
        <p className="mt-4 text-lg">{formatDuration(nav.etaMin)}{nav.progress ? ` · ${formatDistance(nav.progress.remainingM)}` : ""}{nav.etaLabel ? ` · ETA ${nav.etaLabel}` : ""}</p>
      ) : null}
    </div>
  );
}

function SheetBody({
  nav,
  chip,
  task,
  card,
}: {
  nav: ReturnType<typeof useDrive>;
  chip: ReturnType<typeof driverStatusChip>;
  task: { title: string; href: string } | null;
  card: ReturnType<typeof openingCard>;
}) {
  const driving = nav.phase === "navigating" || nav.phase === "recalculating";
  if (nav.sheet === "collapsed") {
    if (!driving) return <ReadyCard card={card} onExpand={() => nav.setSheet("half")} />;
    return (
      <button type="button" className="mt-2 w-full text-left" onClick={() => nav.setSheet("half")}>
        <span className="numeric text-4xl"><SpeedFigure value={nav.speed} /></span>
        <span className="mt-1 block text-sm opacity-70">
          km/h · {nav.limit.kph == null ? "Limit unavailable" : `Limit ${nav.limit.kph}`}
          {nav.etaMin != null ? ` · ${formatDuration(nav.etaMin)}` : ""}
          {nav.etaLabel ? ` · ETA ${nav.etaLabel}` : ""}
        </span>
      </button>
    );
  }
  return (
    <div>
      {driving ? <Instrument nav={nav} /> : <BriefRows nav={nav} chip={chip} task={task} />}
      <p className="mt-4 text-xs opacity-60">{nav.demoOn ? "DEMO · simulated movement, not your GPS" : nav.fix ? "Location from this device · traffic not connected" : "Showing Accra. This is not your location."}</p>
      {nav.roadNotes.map((note) => (
        <p key={note.id} className="mt-3 text-sm">{note.title}. {note.detail}</p>
      ))}
      {driving ? (
        <div className="mt-4 flex gap-2">
          <button type="button" className="drive-quiet" onClick={() => nav.setPaused(!nav.paused)}><Pause size={14} /> {nav.paused ? "Resume" : "Pause"}</button>
          <button type="button" className="drive-action" onClick={nav.finish}><Square size={14} /> End</button>
        </div>
      ) : (
        <button type="button" className="mt-4 text-sm underline" onClick={nav.playDemo}>Play the demo drive</button>
      )}
      {nav.where && !nav.where.startsWith("GPS") ? <p className="mt-3 text-sm">{nav.where}</p> : null}
      {nav.ws.mode === "demo" ? null : (
        <button type="button" className="mt-3 text-sm underline" onClick={() => nav.setExplain(true)}>Use my location</button>
      )}
      {nav.sheet === "full" ? <FullDetails nav={nav} /> : null}
    </div>
  );
}

function ReadyCard({ card, onExpand }: { card: ReturnType<typeof openingCard>; onExpand: () => void }) {
  return (
    <div className="mt-1">
      <button type="button" className="w-full text-left" onClick={onExpand}>
        <p className="text-[13px] tracking-[0.14em]">{card.label}</p>
        <p className="mt-2 text-xl leading-snug">{card.message}</p>
      </button>
      {card.checks ? (
        <ul className="mt-3 grid gap-1 text-sm">
          {card.checks.map((check) => (
            <li key={check.label}>✓ {check.label}</li>
          ))}
        </ul>
      ) : (
        <Link href={card.href} className="mt-3 inline-flex min-h-11 items-center text-sm underline">{card.action}</Link>
      )}
      {card.score != null ? <p className="mt-3 text-sm">Driver score {card.score}</p> : null}
      {card.demo ? <p className="mt-2 text-xs text-muted">DEMO. Not your records.</p> : null}
    </div>
  );
}

function BriefRows({
  nav,
  chip,
  task,
}: {
  nav: ReturnType<typeof useDrive>;
  chip: ReturnType<typeof driverStatusChip>;
  task: { title: string; href: string } | null;
}) {
  const score = nav.ws.score;
  const vehicle = nav.ws.activeVehicle;
  const source = nav.ws.mode === "demo" ? "DEMO" : "CALCULATED";
  const health = driverHealth({
    driverScore: score.overall,
    vehicleCompliance: vehicle?.compliance ?? null,
    openObligations: nav.ws.totals.activeViolations,
  });
  return (
    <dl className="grid gap-4 text-sm">
      <div>
        <dt className="eyebrow opacity-60">Driver score</dt>
        <dd className="mt-1 text-2xl">{score.overall == null ? score.note : score.overall}</dd>
        {score.overall != null && nav.coaching[0] ? <p className="mt-1 opacity-70">{nav.coaching[0]}</p> : null}
        <p className="mt-1 text-xs opacity-50">{score.source === "DEMO" ? "DEMO" : "CALCULATED"}</p>
      </div>
      <div>
        <dt className="eyebrow opacity-60">Driver health</dt>
        <dd className="mt-1">{health.overall == null ? health.note : `${health.overall} · ${health.band}`}</dd>
        <p className="mt-1 text-xs text-muted">{health.overall == null ? "Not enough records." : "CALCULATED from the driver score and vehicle papers already saved."}</p>
      </div>
      <div>
        <dt className="eyebrow opacity-60">Vehicle</dt>
        <dd className="mt-1">
          <Link href={chip.href} className="underline">{vehicle ? `${vehicle.name} · ${vehicle.standingLabel}` : chip.message}</Link>
        </dd>
        <p className="mt-1 text-xs opacity-50">{source}</p>
      </div>
      <div>
        <dt className="eyebrow opacity-60">Traffic</dt>
        <dd className="mt-1">{nav.trafficNote}</dd>
      </div>
      <div>
        <dt className="eyebrow opacity-60">Upcoming</dt>
        <dd className="mt-1">{task ? <Link href={task.href} className="underline">{task.title}</Link> : "Nothing urgent is saved."}</dd>
      </div>
    </dl>
  );
}

function FullDetails({ nav }: { nav: ReturnType<typeof useDrive> }) {
  return (
    <div className="mt-6 grid gap-6 border-t border-current/10 pt-5">
      <ul className="grid">
        {LIBRARY.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="flex min-h-11 items-center text-sm underline-offset-4 hover:underline">{item.label}</Link>
          </li>
        ))}
      </ul>
      <LimitPicker nav={nav} />
      <Settings nav={nav} />
      <Places nav={nav} />
      <History nav={nav} />
      {nav.ws.mode === "demo" ? (
        <form action={exitDemoAction}>
          <button type="submit" className="text-sm underline">Exit demo</button>
        </form>
      ) : null}
      <p className="text-xs opacity-60">Road intelligence is not connected. Source: not connected. Confidence: none. A school zone, market or flood notice appears only when a feed provides it.</p>
    </div>
  );
}

function LimitPicker({ nav }: { nav: ReturnType<typeof useDrive> }) {
  return (
    <div>
      <p className="eyebrow opacity-60">Limit you are following</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {LIMITS.map((item) => (
          <button key={item.kph} type="button" className="rounded-[10px] border border-current/15 px-3 py-2 text-sm" aria-pressed={nav.declared === item.kph} onClick={() => nav.setLimit(item.kph)}>
            {item.label} {item.kph}
          </button>
        ))}
        <button type="button" className="px-3 py-2 text-sm underline" onClick={() => nav.setLimit(null)}>Clear</button>
      </div>
      <p className="mt-2 text-xs opacity-60">
        {nav.limit.source === "openstreetmap"
          ? "Mapped limit for this road. The posted sign controls."
          : nav.limit.source === "user_declared"
            ? nav.roadName
              ? `You set this for ${nav.roadName}. The posted sign controls.`
              : "You set this for the road you are on. The posted sign controls."
            : "No mapped limit here. Choose the sign you see. It is saved for this road."}
      </p>
    </div>
  );
}

function Settings({ nav }: { nav: ReturnType<typeof useDrive> }) {
  return (
    <div className="grid gap-3 text-sm">
      <label className="flex items-center justify-between gap-3">
        Voice
        <select className="bg-transparent" value={nav.voice} onChange={(event) => nav.setVoiceMode(event.target.value as typeof nav.voice)}>
          <option value="off">Off</option>
          <option value="on">On</option>
          <option value="important">Important only</option>
          <option value="navigation">Navigation only</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-3">
        Rerouting
        <select className="bg-transparent" value={nav.rerouteMode} onChange={(event) => nav.setReroute(event.target.value as typeof nav.rerouteMode)}>
          <option value="ask">Ask first</option>
          <option value="auto">Automatic</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-3">
        Appearance
        <select className="bg-transparent" value={nav.appearance} onChange={(event) => nav.setAppearanceMode(event.target.value as typeof nav.appearance)}>
          <option value="auto">Automatic</option>
          <option value="day">Day</option>
          <option value="night">Night</option>
        </select>
      </label>
      <ul className="grid gap-1 text-xs opacity-60">
        {nav.providerNotes.slice(0, 4).map((note) => <li key={note}>{note}</li>)}
      </ul>
      {nav.providerOff ? null : (
        <div className="flex gap-2">
          {(["driving", "walking", "cycling"] as TravelMode[]).map((mode) => (
            <button key={mode} type="button" className="rounded-[10px] border border-current/15 px-3 py-2 capitalize" aria-pressed={nav.travelMode === mode} onClick={() => nav.changeMode(mode)}>{mode}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Places({ nav }: { nav: ReturnType<typeof useDrive> }) {
  const slots: { slot: PlaceView["slot"]; label: string; icon: ReactNode }[] = [
    { slot: "home", label: "Home", icon: <House size={14} /> },
    { slot: "work", label: "Work", icon: <Briefcase size={14} /> },
    { slot: "school", label: "School", icon: <GraduationCap size={14} /> },
  ];
  return (
    <div>
      <p className="eyebrow opacity-60">Saved places</p>
      <div className="mt-2 grid gap-2">
        {slots.map((item) => {
          const saved = nav.ws.places.find((place) => place.slot === item.slot);
          return (
            <button key={item.slot} type="button" className="flex items-center justify-between gap-3 text-left text-sm" onClick={() => (saved ? nav.choose({ id: saved.id, name: saved.name, address: saved.address, lat: saved.lat, lng: saved.lng }) : nav.saveSlot(item.slot))}>
              <span className="flex items-center gap-2">{item.icon} {item.label}</span>
              <span className="truncate opacity-60">{saved?.name ?? "Save the current destination"}</span>
            </button>
          );
        })}
        {nav.ws.places.filter((place) => place.slot === "favourite").map((place) => (
          <button key={place.id} type="button" className="flex items-center gap-2 text-left text-sm" onClick={() => nav.choose({ id: place.id, name: place.name, address: place.address, lat: place.lat, lng: place.lng })}>
            <Star size={14} /> {place.name}
          </button>
        ))}
      </div>
      {nav.destination && nav.ws.mode === "user" ? (
        <button type="button" className="mt-2 text-sm underline" onClick={() => nav.saveSlot("favourite")}>Save {nav.destination.name} as a favourite</button>
      ) : null}
      {nav.placeNote ? <p className="mt-2 text-xs opacity-70">{nav.placeNote}</p> : null}
    </div>
  );
}

function History({ nav, paper = false }: { nav: ReturnType<typeof useDrive>; paper?: boolean }) {
  const trips = filterTrips(
    nav.ws.sessions.filter((session) => !nav.hiddenTrips.includes(session.id)),
    nav.historyWindow,
    new Date(),
    { from: nav.customFrom, to: nav.customTo },
  );
  return (
    <div className={paper ? "mt-8" : ""}>
      <p className="eyebrow opacity-60">Trip history</p>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        {(["today", "week", "month", "custom"] as const).map((window) => (
          <button key={window} type="button" className="capitalize underline-offset-4" aria-pressed={nav.historyWindow === window} onClick={() => nav.setHistoryWindow(window)}>{window}</button>
        ))}
      </div>
      {nav.historyWindow === "custom" ? (
        <div className="mt-2 flex gap-2">
          <input type="date" value={nav.customFrom} onChange={(event) => nav.setCustomFrom(event.target.value)} className="bg-transparent text-sm" />
          <input type="date" value={nav.customTo} onChange={(event) => nav.setCustomTo(event.target.value)} className="bg-transparent text-sm" />
        </div>
      ) : null}
      <ul className="mt-3 grid gap-3">
        {trips.length === 0 ? <li className="text-sm opacity-60">No saved trips in this range.</li> : null}
        {trips.map((trip) => (
          <li key={trip.id} className="text-sm">
            <p>{trip.originLabel ?? trip.roadContext} → {trip.destinationLabel ?? "Recorded drive"}</p>
            <p className="opacity-60">{trip.endedAt.slice(0, 10)} · {formatDistance(trip.distanceM ?? 0)} · {trip.minutes} min{trip.speedCompliance != null ? ` · ${trip.speedCompliance}%` : ""}</p>
            {trip.notes.slice(0, 2).map((note) => <p key={note} className="opacity-60">{note}</p>)}
            {nav.ws.mode === "user" ? <button type="button" className="mt-1 underline" onClick={() => nav.removeTrip(trip.id)}>Remove</button> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SearchBody({ nav, paper, autoFocus = false }: { nav: ReturnType<typeof useDrive>; paper?: boolean; autoFocus?: boolean }) {
  const locked = nav.moving && nav.phase === "navigating";
  return (
    <div>
      <label className="flex items-center gap-2 rounded-[14px] border border-current/15 px-3">
        <Search size={16} />
        <input
          autoFocus={autoFocus}
          value={nav.query}
          disabled={locked}
          placeholder={locked ? "Pull over to search" : "Where are you going?"}
          className="h-12 w-full bg-transparent outline-none"
          onChange={(event) => nav.setQuery(event.target.value)}
        />
        {nav.voiceSearchAvailable && !locked ? (
          <button type="button" aria-label="Voice search" onClick={nav.listen}><Mic size={16} /></button>
        ) : null}
      </label>
      {nav.searching ? <p className="mt-3 text-sm opacity-60">Searching…</p> : null}
      {nav.searchError ? <p className="mt-3 text-sm">{nav.searchError}</p> : null}
      <ul className="mt-3 grid gap-1">
        {nav.results.map((place) => (
          <li key={place.id}>
            <button type="button" className="block w-full rounded-[12px] px-2 py-2 text-left hover:bg-black/5" onClick={() => nav.choose(place)}>
              <span className="block">{place.name}</span>
              <span className="block text-sm opacity-60">{place.address}{place.distanceM != null ? ` · ${formatDistance(place.distanceM)}` : ""}</span>
            </button>
          </li>
        ))}
      </ul>
      {nav.query.trim().length < 2 ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {SEARCH_SHORTCUTS.map(([label, query]) => (
              <button key={label} type="button" className="rounded-full border border-current/15 px-3 py-1 text-sm" onClick={() => nav.setQuery(query)}>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(["home", "work", "school"] as const).map((slot) => {
              const saved = nav.ws.places.find((place) => place.slot === slot);
              if (!saved) return null;
              return (
                <button key={slot} type="button" className="rounded-full border border-current/15 px-3 py-1 text-sm capitalize" onClick={() => nav.choose(saved)}>
                  {slot} · {saved.name}
                </button>
              );
            })}
          </div>
          <p className="eyebrow mt-5 opacity-60">Recent</p>
          <ul className="mt-2 grid gap-2">
            {nav.recents.length === 0 ? <li className="text-sm opacity-60">Recent destinations will gather here.</li> : null}
            {nav.recents.map((place) => (
              <li key={place.id} className="flex items-center justify-between gap-2 text-sm">
                <button type="button" className="min-w-0 truncate text-left" onClick={() => nav.choose(place)}>
                  {place.name}
                  <span className="block opacity-60">{place.distanceM != null ? formatDistance(place.distanceM) : place.address}</span>
                </button>
                <button type="button" aria-label={`Remove ${place.name}`} onClick={() => nav.removeRecent(place.id)}>Remove</button>
              </li>
            ))}
          </ul>
          {paper ? <button type="button" className="drive-action mt-5" onClick={nav.playDemo}>Play the demo drive</button> : null}
        </>
      ) : null}
    </div>
  );
}

function RouteCard({ nav, chip }: { nav: ReturnType<typeof useDrive>; chip: ReturnType<typeof driverStatusChip> }) {
  return (
    <div className="rounded-[16px] bg-paper p-4 text-ink shadow-soft">
      <p className="text-2xl">{nav.destination?.name}</p>
      <p className="mt-1 text-sm opacity-70">{nav.originIsUser ? nav.originLabel : nav.originPinned ? `From ${nav.originLabel}. Not your GPS.` : "From central Accra, not your location"}</p>
      {nav.selected ? (
        <p className="mt-3 text-lg">{formatDuration(nav.selected.durationS / 60)} · {formatDistance(nav.selected.distanceM)}</p>
      ) : null}
      <dl className="mt-3 grid gap-2 text-sm">
        <div className="flex justify-between gap-4"><dt className="opacity-60">Traffic</dt><dd className="text-right">{nav.trafficNote}</dd></div>
        <div className="flex justify-between gap-4"><dt className="opacity-60">Route quality</dt><dd className="text-right">Not scored. No road-risk feed is connected.</dd></div>
        <div className="flex justify-between gap-4"><dt className="opacity-60">Speed changes</dt><dd className="text-right">{nav.upcoming ? `Limit ${nav.upcoming.kph} in ${formatDistance(nav.upcoming.metres)}` : "None reported on this route."}</dd></div>
        <div className="flex justify-between gap-4"><dt className="opacity-60">You</dt><dd className="text-right">{chip.label}. {chip.message}</dd></div>
      </dl>
      {nav.routeError ? <p className="mt-3 text-sm">{nav.routeError}</p> : null}
      <ul className="mt-3 grid gap-2">
        {nav.routes.map((route) => (
          <li key={route.id}>
            <button type="button" aria-pressed={nav.selected?.id === route.id} className="w-full rounded-[12px] border border-current/10 px-3 py-2 text-left" onClick={() => nav.selectRoute(route.id)}>
              <span className="block text-sm opacity-60">{route.label}</span>
              <span>{formatDuration(route.durationS / 60)} · {formatDistance(route.distanceM)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <button type="button" className="drive-action" disabled={!nav.fix || !nav.selected} onClick={nav.start}>Start</button>
        <button type="button" className="drive-quiet" onClick={nav.closePreview}>Cancel</button>
      </div>
      {!nav.fix ? <p className="mt-2 text-xs opacity-70">Location is needed to navigate. You can preview the route, or play the demo drive.</p> : null}
    </div>
  );
}

function SummaryCard({ nav }: { nav: ReturnType<typeof useDrive> }) {
  const trip = nav.summary;
  if (!trip) return null;
  return (
    <div className="absolute inset-0 z-40 grid place-items-end bg-black/40 p-3 sm:place-items-center">
      <div className="max-h-[88%] w-full max-w-md overflow-y-auto rounded-[16px] bg-paper p-5 text-ink">
        <p className="eyebrow">{trip.demo ? "Demonstration" : "Trip complete"}</p>
        <h2 className="display mt-2 text-5xl">{trip.demo ? "Arrived" : "Arrived"}</h2>
        <p className="mt-4 text-lg">{trip.origin}</p>
        <p className="text-lg">↓ {trip.destination}</p>
        <p className="mt-4 text-2xl">{formatDistance(trip.distanceM)} · {formatDuration(trip.minutes)}</p>
        {trip.demo ? <p className="mt-1 text-xs text-muted">Scripted duration. The demonstration is not a timed drive.</p> : null}
        <dl className="mt-5 grid gap-2 text-sm">
          <div className="flex justify-between"><dt>Speed compliance</dt><dd>{trip.compliance == null ? "Unavailable" : `${trip.compliance}%`}</dd></div>
          <div className="flex justify-between"><dt>Harsh braking</dt><dd>{trip.harshBrakes}</dd></div>
          <div className="flex justify-between"><dt>Rapid acceleration</dt><dd>{trip.harshAccels}</dd></div>
        </dl>
        <p className="mt-4 text-sm">{trip.intelligence.quality == null ? trip.intelligence.qualityNote : `Trip quality ${trip.intelligence.quality}. ${trip.intelligence.qualityNote}`}</p>
        <p className="mt-2 text-sm">{trip.intelligence.scoreImpact}</p>
        {trip.intelligence.improvements.map((line) => <p key={line} className="mt-2 text-sm">{line}</p>)}
        <p className="mt-2 text-xs text-muted">{trip.intelligence.source === "DEMO" ? "DEMO" : "CALCULATED"} · {trip.intelligence.trafficSummary}</p>
        {trip.comparison ? <p className="mt-4 text-sm">{trip.comparison}</p> : null}
        <p className="mt-4 text-lg">{trip.closing}</p>
        {trip.notes.map((note) => <p key={note} className="mt-2 text-sm text-muted">{note}</p>)}
        <p className="mt-3 text-xs text-muted">{trip.saved === "saving" ? "Saving…" : trip.saved === "saved" ? "Saved to your trip history." : trip.saved === "error" ? trip.saveError : "Not saved."}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="drive-action" onClick={() => { nav.setSearchOpen(false); nav.closePreview(); }}>Done</button>
          {trip.sessionId ? <button type="button" className="drive-quiet" onClick={nav.discardSummary}>Remove this trip</button> : null}
          <button type="button" className="drive-quiet" onClick={nav.playDemo}>Play the demo again</button>
        </div>
      </div>
    </div>
  );
}

