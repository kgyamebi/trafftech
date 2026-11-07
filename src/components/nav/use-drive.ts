"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { mapProviderId } from "@/config/maps";
import { localPlaceHits, mergePlaceHits, routeHoldFrom, type MapMark } from "@/domain/catalogue";
import { DriverIntelligenceEngine, type TripIntelligence } from "@/domain/intelligence";
import { demoCapabilities, openCapabilities, unsupportedNotes } from "@/domain/providers";
import {
  ACCRA_CENTRE,
  TRAFFIC_NOTE,
  buildDemoFrames,
  closingLine,
  countHarsh,
  decimate,
  destinationAllowed,
  distanceBucket,
  etaClock,
  etaMinutes,
  forgetPlace,
  freshness,
  HARSH_ACCEL_RISE,
  HARSH_BRAKE_DROP,
  bearingDeg,
  guidancePhrase,
  haversine,
  inGhana,
  locationMessage,
  makeEvent,
  mapFailureMessage,
  movementStatus,
  followingInstruction,
  nextInstruction,
  prefersNight,
  progressAlong,
  splitRoute,
  rememberPlace,
  rerouteDecision,
  steadyPosition,
  roadNotesFor,
  shouldSpeak,
  speedLimitProvider,
  summariseScript,
  tripComparison,
  withDistance,
  type AppearanceMode,
  type DriveEvent,
  type GeoPoint,
  type MapPin,
  type PlaceHit,
  type RerouteMode,
  type RouteOption,
  type TravelMode,
  type VoiceMode,
} from "@/domain/navigation";
import { gpsSpeedReading, medianSpeed, parkedReading } from "@/domain/gps-speed";
import { chooseRoadLimit, rememberRoadLimit } from "@/domain/road-limit";
import { pendingTripFrom, type PendingTrip } from "@/domain/pending-trip";
import { speedCompliance } from "@/domain/score";
import { mergeDriveCookie } from "@/domain/drive-prefs";
import type { PlaceView, Workspace } from "@/domain/types";
import { speak } from "../speak";
import { deletePlaceAction, deleteSessionAction, savePlaceAction, saveSessionAction } from "@/server/actions";
import { createOpenMapProvider, createOpenServices, reverseLabel } from "./map-client";

const PENDING_TRIP = "nokware-pending-trip";

function holdTrip(trip: PendingTrip) {
  try {
    localStorage.setItem(PENDING_TRIP, JSON.stringify(trip));
  } catch {
    /* the summary on screen is the other copy */
  }
}

function heldTrip(): PendingTrip | null {
  try {
    return pendingTripFrom(JSON.parse(localStorage.getItem(PENDING_TRIP) ?? "null") as unknown);
  } catch {
    return null;
  }
}

function dropTrip() {
  try {
    localStorage.removeItem(PENDING_TRIP);
  } catch {
    /* private mode */
  }
}

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
  speedKph: number | null;
  trust: "ready" | "reduced" | "wait";
  line: string;
  heading: number | null;
  at: number;
}

export interface TripSummaryState {
  demo: boolean;
  origin: string;
  destination: string;
  distanceM: number;
  minutes: number;
  compliance: number | null;
  harshBrakes: number;
  harshAccels: number;
  comparison: string | null;
  closing: string;
  notes: string[];
  saved: "no" | "saving" | "saved" | "error";
  saveError: string;
  held: boolean;
  sessionId: string | null;
  intelligence: TripIntelligence;
}

type Phase = "browse" | "preview" | "navigating" | "recalculating" | "offer" | "summary";
type Loc = "idle" | "ok" | "weak" | "denied" | "unavailable";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const ROUTE_HOLD = "nokware-route-hold";

export function useDrive(ws: Workspace, initialVoice: VoiceMode = "off", marks: MapMark[] = []) {
  const router = useRouter();
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const restoredHold = useRef(false);
  const providerOff = mapProviderId() === "off";
  const frames = useMemo(() => buildDemoFrames(), []);
  const [phase, setPhase] = useState<Phase>("browse");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [recents, setRecents] = useState<PlaceHit[]>([]);
  const [destination, setDestination] = useState<PlaceHit | null>(null);
  const [stop, setStop] = useState<PlaceHit | null>(null);
  const [origin, setOrigin] = useState<GeoPoint>(ACCRA_CENTRE);
  const [originLabel, setOriginLabel] = useState("Central Accra");
  const [originIsUser, setOriginIsUser] = useState(false);
  const [originPinned, setOriginPinned] = useState(false);
  const [pin, setPin] = useState<GeoPoint | null>(null);
  const [pinPlace, setPinPlace] = useState<MapPin | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinNote, setPinNote] = useState("");
  const [nearby, setNearby] = useState<(PlaceHit & { distanceM: number | null })[]>([]);
  const [nearbyBusy, setNearbyBusy] = useState(false);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [routeError, setRouteError] = useState("");
  const [travelMode, setTravelMode] = useState<TravelMode>("driving");
  const [demoOn, setDemoOn] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [loc, setLoc] = useState<Loc>("idle");
  const [consent, setConsent] = useState<"unknown" | "yes" | "no">("unknown");
  const [consentReady, setConsentReady] = useState(false);
  const [explain, setExplain] = useState(false);
  const [follow, setFollow] = useState(true);
  const [fitToken, setFitToken] = useState(0);
  const [mapFailed, setMapFailed] = useState(providerOff);
  const [mapKey, setMapKey] = useState(0);
  const [appearance, setAppearance] = useState<AppearanceMode>("auto");
  const [voice, setVoice] = useState<VoiceMode>(initialVoice);
  const [rerouteMode, setRerouteMode] = useState<RerouteMode>("ask");
  const [declared, setDeclared] = useState<number | null>(null);
  const [mapped, setMapped] = useState<{ kph: number; road: string | null } | null>(null);
  const [roadName, setRoadName] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [lastRouteAt, setLastRouteAt] = useState<number | null>(null);
  const [summary, setSummary] = useState<TripSummaryState | null>(null);
  const [offer, setOffer] = useState<{ route: RouteOption; savesMin: number; routes: RouteOption[] } | null>(null);
  const [banner, setBanner] = useState("");
  const [sheet, setSheet] = useState<"collapsed" | "half" | "full">("collapsed");
  const [layersOpen, setLayersOpen] = useState(false);
  const [showPlaces, setShowPlaces] = useState(true);
  const [historyWindow, setHistoryWindow] = useState<"today" | "week" | "month" | "custom">("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [hiddenTrips, setHiddenTrips] = useState<string[]>([]);
  const [placeNote, setPlaceNote] = useState("");
  const [events, setEvents] = useState<DriveEvent[]>([]);
  const [voiceSearchAvailable, setVoiceSearchAvailable] = useState(false);
  const [gpsSlow, setGpsSlow] = useState(false);

  const samples = useRef<{ t: string; speedKph: number; limitKph: number }[]>([]);
  const anchorRef = useRef<{ lat: number; lng: number; at: number; accuracyM: number } | null>(null);
  const placeRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const outlierRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const courseRef = useRef<number | null>(null);
  const alongHint = useRef<number | null>(null);
  const routeStamp = useRef("");
  const originRef = useRef<GeoPoint>(ACCRA_CENTRE);
  const originLocked = useRef(false);
  const pinToken = useRef(0);
  const speedHistory = useRef<number[]>([]);
  const notesRef = useRef<string[]>([]);
  const startedAt = useRef<string | null>(null);
  const finished = useRef(false);
  const offCount = useRef(0);
  const lastReroute = useRef(0);
  const spoken = useRef({ text: "", bucket: -1 });
  const limitSpoken = useRef<number | null>(null);
  const provider = useRef(createOpenMapProvider());
  const services = useRef(createOpenServices());
  const fixRef = useRef<Fix | null>(null);
  const declaredRef = useRef<number | null>(null);
  const limitQuery = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const savedRoads = useRef<Record<string, number>>({});
  const pendingRoadSave = useRef(false);
  fixRef.current = fix;
  declaredRef.current = declared;

  const frame = demoOn ? frames[frameIndex] : null;
  const selected = routes.find((route) => route.id === selectedId) ?? routes[0] ?? null;
  const routeKey = selected ? `${selected.id}:${selected.distanceM}:${selected.geometry.length}` : "";
  if (routeStamp.current !== routeKey) {
    routeStamp.current = routeKey;
    alongHint.current = null;
  }
  const matched =
    !frame && fix && selected && (phase === "navigating" || phase === "recalculating")
      ? progressAlong(fix, selected.geometry, alongHint.current)
      : null;
  if (matched) alongHint.current = matched.traveledM;
  const snapReach = fix ? Math.min(40, Math.max(fix.accuracy, 18)) : 18;
  const onRoute = Boolean(matched && matched.offRouteM <= snapReach);
  const puckPoint: GeoPoint | null = frame ? frame.point : onRoute && matched ? matched.snapped : fix;
  const speedKnown = Boolean(frame) || (fix != null && fix.trust !== "wait" && fix.speedKph != null);
  const speed = frame ? frame.speedKph : (fix?.speedKph ?? 0);
  const headingKnown = frame != null || fix?.heading != null || Boolean(onRoute && matched);
  const bearing = frame?.bearing ?? fix?.heading ?? (onRoute && matched ? matched.bearing : 0);
  const limit = speedLimitProvider.getApplicableSpeedLimit({
    at: frame ? "demo-script" : new Date().toISOString(),
    location: puckPoint,
    declaredKph: demoOn ? null : declared,
    mapped: demoOn ? null : mapped,
    demo: frame?.limit ?? null,
  });
  const upcoming = speedLimitProvider.getUpcomingSpeedLimitChanges(frame?.upcoming ?? null);
  const progress = frame ? { traveledM: 0, remainingM: frame.remainingM, offRouteM: 0 } : matched;
  const instruction = frame?.instruction ?? (progress && selected ? nextInstruction(progress.traveledM, selected.steps) : null);
  const thenCue = frame || !progress || !selected || !instruction ? null : followingInstruction(progress.traveledM, selected.steps);
  const etaMin = frame
    ? frame.etaMin
    : progress && selected
      ? etaMinutes(progress.remainingM, speed, selected.durationS, selected.distanceM)
      : selected
        ? Math.max(1, Math.round(selected.durationS / 60))
        : null;
  const night = prefersNight(new Date(), appearance);
  const locKind = frame ? "demo" : fix && Date.now() - fix.at > 20_000 ? "stale" : loc === "ok" && fix && fix.accuracy > 50 ? "weak" : loc === "idle" ? "ok" : loc;
  const moving = speedKnown && !demoOn && !frame && speed > 8;
  const traveledBucket = progress ? Math.floor(progress.traveledM / 80) * 80 : 0;
  const guiding = !frame && selected && progress && (phase === "navigating" || phase === "recalculating") && traveledBucket > 80;
  const turnPoint = !frame && selected && progress
    ? selected.steps.find((step) => step.kind !== "depart" && step.kind !== "arrive" && step.distanceFromStartM >= progress.traveledM - 20)?.at ?? null
    : null;
  const along = guiding && selected ? splitRoute(selected.geometry, traveledBucket) : null;
  const lines = frame
    ? [
        ...(frame.fadedGeometry ? [{ id: "faded", points: frame.fadedGeometry, active: false, faded: true }] : []),
        { id: "demo", points: frame.geometry, active: true, faded: false },
      ]
    : along && selected
      ? [
          ...routes.filter((route) => route.id !== selected.id).map((route) => ({ id: route.id, points: route.geometry, active: false, faded: true })),
          { id: `${selected.id}-done`, points: along.done, active: false, faded: true },
          { id: selected.id, points: along.left, active: true, faded: false },
        ]
      : routes.map((route) => ({ id: route.id, points: route.geometry, active: route.id === (selected?.id ?? ""), faded: false }));

  useEffect(() => {
    void provider.current.initialize();
    setConsent(localStorage.getItem("nokware-location-consent") === "yes" ? "yes" : localStorage.getItem("nokware-location-consent") === "no" ? "no" : "unknown");
    setRerouteMode((localStorage.getItem("nokware-nav-reroute") as RerouteMode) || "ask");
    setAppearance((localStorage.getItem("nokware-nav-appearance") as AppearanceMode) || "auto");
    savedRoads.current = readJson<Record<string, number>>("nokware-road-limits", {});
    setRecents(readJson<PlaceHit[]>(`nokware-recent-${ws.viewer.id}`, []));
    setOnline(navigator.onLine);
    setVoiceSearchAvailable("webkitSpeechRecognition" in window);
    setConsentReady(true);
    return () => provider.current.dispose();
  }, [ws.viewer.id]);

  useEffect(() => {
    if (demoOn || consent !== "yes" || !navigator.geolocation) {
      if (consent === "yes" && !demoOn && !navigator.geolocation) setLoc("unavailable");
      return;
    }
    let follows = 0;
    let followUp = 0;
    let parkedTimer = 0;
    const options: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 };
    function apply(position: GeolocationPosition) {
      const current = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        at: position.timestamp,
        accuracyM: position.coords.accuracy,
        deviceSpeedMps: position.coords.speed,
      };
      const reading = gpsSpeedReading(anchorRef.current, current);
      if (current.accuracyM <= 100) anchorRef.current = current;
      const previous = placeRef.current;
      const place = steadyPosition(previous, { lat: current.lat, lng: current.lng, at: current.at });
      const rejected = previous != null && place.lat === previous.lat && place.lng === previous.lng && (current.lat !== place.lat || current.lng !== place.lng);
      const outlier = outlierRef.current;
      const confirmed = rejected && outlier != null && current.at - outlier.at < 8_000 && haversine(outlier, current) < 40;
      const accepted = confirmed ? { lat: current.lat, lng: current.lng } : place;
      if (!rejected || confirmed) {
        if (previous && haversine(previous, accepted) >= 12) courseRef.current = bearingDeg(previous, accepted);
        placeRef.current = { lat: accepted.lat, lng: accepted.lng, at: current.at };
        outlierRef.current = null;
      } else {
        outlierRef.current = { lat: current.lat, lng: current.lng, at: current.at };
      }
      const deviceHeading = position.coords.heading;
      const movingNow = (reading.speedKph ?? 0) > 8;
      const heading = movingNow && courseRef.current != null
        ? courseRef.current
        : deviceHeading != null && Number.isFinite(deviceHeading)
          ? deviceHeading
          : courseRef.current;
      const smoothed = medianSpeed(speedHistory.current, reading.speedKph);
      speedHistory.current = smoothed.history;
      setFix({
        lat: accepted.lat,
        lng: accepted.lng,
        accuracy: current.accuracyM,
        speedKph: smoothed.speedKph,
        trust: reading.trust,
        line: reading.line,
        heading,
        at: current.at,
      });
      setLoc(reading.trust === "wait" ? "weak" : "ok");
      window.clearTimeout(parkedTimer);
      if (smoothed.speedKph == null && current.accuracyM <= 100) {
        const held = anchorRef.current;
        const heldPlace = placeRef.current;
        parkedTimer = window.setTimeout(() => {
          setFix((existing) => {
            if (existing?.speedKph != null || !held) return existing;
            const parked = parkedReading(held.accuracyM);
            return {
              lat: heldPlace?.lat ?? held.lat,
              lng: heldPlace?.lng ?? held.lng,
              accuracy: held.accuracyM,
              speedKph: parked.speedKph,
              trust: parked.trust,
              line: parked.line,
              heading: existing?.heading ?? null,
              at: heldPlace?.at ?? held.at,
            };
          });
          if (held) setLoc(held.accuracyM <= 100 ? "ok" : "weak");
        }, 2500);
      }
      if (reading.speedKph == null && current.accuracyM <= 100 && follows < 2) {
        follows += 1;
        window.clearTimeout(followUp);
        followUp = window.setTimeout(() => navigator.geolocation.getCurrentPosition(apply, () => undefined, options), 1000);
      }
    }
    const watch = navigator.geolocation.watchPosition(apply, (error) => {
      if (error.code === 1) setLoc("denied");
      else setLoc((current) => (current === "ok" ? current : "unavailable"));
    }, options);
    return () => {
      navigator.geolocation.clearWatch(watch);
      window.clearTimeout(followUp);
      window.clearTimeout(parkedTimer);
      speedHistory.current = [];
      anchorRef.current = null;
      placeRef.current = null;
      outlierRef.current = null;
      courseRef.current = null;
    };
  }, [consent, demoOn]);

  useEffect(() => {
    if (demoOn || consent !== "yes") return;
    let stopped = false;
    async function lookup() {
      const current = fixRef.current;
      if (!current || current.accuracy > 100) return;
      const last = limitQuery.current;
      if (last && haversine(last, current) < 120 && Date.now() - last.at < 15_000) return;
      limitQuery.current = { lat: current.lat, lng: current.lng, at: Date.now() };
      try {
        const response = await fetch(`/api/maps/limit?lat=${current.lat}&lng=${current.lng}`);
        if (!response.ok || stopped) return;
        const body = (await response.json()) as { kph?: number | null; road?: string | null; fresh?: boolean };
        if (!body.fresh) {
          limitQuery.current = last;
          return;
        }
        const road = body.road?.trim() || null;
        const choice = chooseRoadLimit({ road, mappedKph: body.kph ?? null, saved: savedRoads.current });
        setRoadName(road);
        if (choice.source === "openstreetmap" && choice.kph != null) {
          pendingRoadSave.current = false;
          setMapped({ kph: choice.kph, road });
          setDeclared(null);
          return;
        }
        setMapped(null);
        if (choice.source === "user_declared") {
          pendingRoadSave.current = false;
          setDeclared(choice.kph);
          return;
        }
        setDeclared((held) => {
          if (pendingRoadSave.current && held != null) {
            if (road) {
              pendingRoadSave.current = false;
              savedRoads.current = rememberRoadLimit(savedRoads.current, road, held);
              localStorage.setItem("nokware-road-limits", JSON.stringify(savedRoads.current));
            }
            return held;
          }
          pendingRoadSave.current = false;
          return null;
        });
      } catch {
        limitQuery.current = last;
      }
    }
    void lookup();
    const timer = window.setInterval(() => void lookup(), 8_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [consent, demoOn]);

  useEffect(() => {
    if (demoOn || consent !== "yes" || fix) {
      setGpsSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setGpsSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, [demoOn, consent, fix]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!demoOn || paused || phase !== "navigating" || frame?.arrived) return;
    const timer = window.setInterval(() => setFrameIndex((index) => Math.min(frames.length - 1, index + 1)), 1300);
    return () => window.clearInterval(timer);
  }, [demoOn, paused, phase, frame?.arrived, frames.length]);

  useEffect(() => {
    if (phase !== "navigating" || demoOn || paused) return;
    const timer = window.setInterval(() => {
      const current = fixRef.current;
      const limitKph = declaredRef.current;
      if (!current || current.trust !== "ready" || current.speedKph == null || limitKph == null) return;
      const sample = { t: new Date().toISOString(), speedKph: current.speedKph, limitKph };
      const previous = samples.current[samples.current.length - 1];
      samples.current.push(sample);
      if (previous && previous.speedKph - sample.speedKph >= HARSH_BRAKE_DROP) {
        notesRef.current.push("Harsh braking");
        pushEvent(makeEvent({
          type: "HARD_BRAKING",
          at: sample.t,
          location: current,
          source: "device",
          confidence: "low",
          metadata: { fromKph: previous.speedKph, toKph: sample.speedKph },
        }));
      }
      if (previous && sample.speedKph - previous.speedKph >= HARSH_ACCEL_RISE) {
        notesRef.current.push("Rapid acceleration");
        pushEvent(makeEvent({
          type: "RAPID_ACCELERATION",
          at: sample.t,
          location: current,
          source: "device",
          confidence: "low",
          metadata: { fromKph: previous.speedKph, toKph: sample.speedKph },
        }));
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [phase, demoOn, paused]);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      const text = query.trim();
      if (text.length < 2) {
        setResults([]);
        setSearching(false);
        if (!text) setSearchError("");
        return;
      }
      const gate = destinationAllowed(text);
      if (!gate.ok) {
        setSearchError(gate.reason);
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      setSearchError("");
      const local = localPlaceHits(text, ws.places, marksRef.current);
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setSearching(false);
        setResults(local);
        setSearchError(local.length ? "" : "Search needs a connection. Saved places already on this screen stay available.");
        return;
      }
      const result = await services.current.search.searchPlaces(text);
      setSearching(false);
      if (!result.ok) {
        if (local.length) {
          setResults(local);
          setSearchError("");
        } else {
          setSearchError(result.message);
          setResults([]);
        }
        return;
      }
      const places = mergePlaceHits(local, result.places);
      setResults(places);
      if (!places.length) setSearchError("No places matched.");
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (restoredHold.current || ws.mode !== "user") return;
    restoredHold.current = true;
    try {
      const held = routeHoldFrom(JSON.parse(sessionStorage.getItem(ROUTE_HOLD) || "null"));
      if (!held) return;
      setDestination(held.destination);
      setRoutes(held.routes);
      setSelectedId(held.selectedId);
      setPhase("preview");
      setBanner("The route already on this phone is back.");
    } catch {
      /* private mode or a damaged hold */
    }
  }, [ws.mode]);

  useEffect(() => {
    if (!restoredHold.current || ws.mode !== "user" || demoOn) return;
    const keeping = Boolean(destination && routes.length > 0 && (phase === "preview" || phase === "navigating" || phase === "recalculating" || phase === "offer"));
    try {
      if (!keeping) {
        sessionStorage.removeItem(ROUTE_HOLD);
        return;
      }
      sessionStorage.setItem(ROUTE_HOLD, JSON.stringify({ at: Date.now(), destination, routes, selectedId }));
    } catch {
      /* private mode */
    }
  }, [demoOn, destination, phase, routes, selectedId, ws.mode]);

  useEffect(() => {
    if (phase !== "navigating" || !instruction) return;
    const bucket = distanceBucket(instruction.metres);
    if (spoken.current.text === instruction.text && spoken.current.bucket === bucket) return;
    spoken.current = { text: instruction.text, bucket };
    if (shouldSpeak(voice, "guidance")) speak(guidancePhrase(instruction.text, instruction.metres));
  }, [instruction, phase, voice]);

  useEffect(() => {
    if (limit.kph == null) return;
    if (limitSpoken.current === limit.kph) return;
    const previous = limitSpoken.current;
    limitSpoken.current = limit.kph;
    if (previous == null || !shouldSpeak(voice, "warning")) return;
    speak(demoOn ? `On this demonstration, the speed limit is now ${limit.kph} kilometres per hour.` : limit.source === "openstreetmap" ? `Mapped limit for this road is ${limit.kph} kilometres per hour. The posted sign controls.` : `The limit you set is now ${limit.kph} kilometres per hour.`);
  }, [limit.kph, limit.source, voice, demoOn]);

  useEffect(() => {
    if (demoOn || paused || phase !== "navigating" || !fix || !selected || !destination) return;
    if (!matched) return;
    if (matched.remainingM < 150) {
      offCount.current = 0;
      return;
    }
    const gate = fix.accuracy > 0 ? Math.max(60, Math.min(180, fix.accuracy * 1.5)) : 60;
    offCount.current = matched.offRouteM > gate ? offCount.current + 1 : 0;
    const decision = rerouteDecision({ offRouteM: matched.offRouteM, consecutive: offCount.current, mode: rerouteMode, accuracyM: fix.accuracy });
    if (decision === "none" || Date.now() - lastReroute.current < 20_000) return;
    offCount.current = 0;
    lastReroute.current = Date.now();
    void recalculate(decision === "auto");
    // recalculate closes over the latest destination and fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fix, phase, demoOn, paused, rerouteMode]);

  useEffect(() => {
    if (phase !== "navigating" || finished.current || paused) return;
    if (frame?.arrived) {
      void finish(true);
      return;
    }
    if (!demoOn && speedKnown && progress && selected && progress.remainingM < 40 && speed < 10) void finish(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame?.arrived, phase, progress?.remainingM, speed, paused, demoOn]);

  function pushEvent(event: DriveEvent) {
    setEvents((current) => [...current, event].slice(-12));
  }

  async function choose(hit: PlaceHit) {
    const nextRecents = rememberPlace(recents, hit);
    setRecents(nextRecents);
    localStorage.setItem(`nokware-recent-${ws.viewer.id}`, JSON.stringify(nextRecents));
    setDestination(hit);
    setSearchOpen(false);
    setQuery("");
    setPhase("preview");
    setRouteError("");
    setDemoOn(false);
    setPin(hit);
    const from = originLocked.current ? originRef.current : (fix ?? ACCRA_CENTRE);
    if (!originLocked.current) {
      originRef.current = from;
      setOrigin(from);
      setOriginIsUser(Boolean(fix));
      setOriginLabel(fix ? "Your location" : "Central Accra");
      setOriginPinned(false);
    }
    const result = await services.current.navigation.calculateRoute(from, hit, travelMode, stop && haversine(stop, hit) > 40 ? stop : null);
    if (!result.ok) {
      setRoutes([]);
      setRouteError(result.message);
      return;
    }
    setRoutes(result.routes);
    setSelectedId(result.routes[0].id);
    setLastRouteAt(Date.now());
    setFitToken((value) => value + 1);
    if (fix && !originLocked.current) {
      const label = await reverseLabel(fix);
      if (label) setOriginLabel(label);
    }
  }

  async function changeMode(mode: TravelMode) {
    setTravelMode(mode);
    if (!destination || demoOn) return;
    const result = await services.current.navigation.calculateRoute(origin, destination, mode, stop);
    if (!result.ok) {
      setRouteError(`${mode === "driving" ? "Driving" : mode === "walking" ? "Walking" : "Cycling"} routes are not available right now.`);
      return;
    }
    setRouteError("");
    setRoutes(result.routes);
    setSelectedId(result.routes[0].id);
    setLastRouteAt(Date.now());
    setFitToken((value) => value + 1);
  }

  function start() {
    if (!selected || !destination || !fix) return;
    finished.current = false;
    samples.current = [];
    notesRef.current = [];
    startedAt.current = new Date().toISOString();
    spoken.current = { text: "", bucket: -1 };
    setFollow(true);
    setSheet("collapsed");
    setPhase("navigating");
    setPin(null);
    pushEvent(makeEvent({ type: "TRIP_STARTED", at: startedAt.current, location: fix, source: "device", confidence: "high", metadata: { destination: destination.name } }));
    provider.current.startNavigation();
  }

  function playDemo() {
    finished.current = false;
    samples.current = [];
    notesRef.current = ["Demonstration"];
    startedAt.current = new Date().toISOString();
    spoken.current = { text: "", bucket: -1 };
    limitSpoken.current = null;
    setDemoOn(true);
    setFrameIndex(0);
    setPaused(false);
    setFollow(true);
    setSearchOpen(false);
    setSummary(null);
    setOffer(null);
    setDestination({ id: "demo-east-legon", name: "East Legon", address: "Demonstration · Airport City to East Legon", lat: 5.6358, lng: -0.1496 });
    setOriginLabel("Airport City");
    setOriginIsUser(false);
    setOriginPinned(false);
    originLocked.current = false;
    setSheet("collapsed");
    setPhase("navigating");
    setPin(null);
    setFitToken((value) => value + 1);
    pushEvent(makeEvent({ type: "TRIP_STARTED", at: new Date().toISOString(), location: frames[0].point, source: "demo_script", confidence: "scripted", metadata: { destination: "East Legon" } }));
  }

  async function recalculate(automatic: boolean) {
    if (!fix || !destination) return;
    setPhase("recalculating");
    setBanner("Recalculating…");
    const result = await services.current.navigation.calculateRoute(fix, destination, travelMode, stop);
    if (!result.ok) {
      setBanner(online ? result.message : "Connection lost. Navigation may use the route already on this phone.");
      setPhase("navigating");
      return;
    }
    const next = result.routes[0];
    const saves = Math.round((selected ? selected.durationS : next.durationS) / 60 - next.durationS / 60);
    setLastRouteAt(Date.now());
    notesRef.current.push("Route recalculated");
    pushEvent(makeEvent({ type: "ROUTE_CHANGED", at: new Date().toISOString(), location: fix, source: "provider", confidence: "low", metadata: { saves } }));
    if (automatic) {
      setRoutes(result.routes);
      setSelectedId(next.id);
      setBanner(saves > 0 ? `New route · saves ${saves} min` : "New route");
      setPhase("navigating");
      return;
    }
    setOffer({ route: next, savesMin: Math.max(0, saves), routes: result.routes });
    setBanner("");
    setPhase("offer");
  }

  function acceptOffer() {
    if (!offer) return;
    setRoutes(offer.routes);
    setSelectedId(offer.route.id);
    setBanner(offer.savesMin > 0 ? `New route · saves ${offer.savesMin} min` : "New route");
    setOffer(null);
    setFitToken((value) => value + 1);
    setPhase("navigating");
  }

  async function finish(arrived: boolean) {
    if (finished.current) return;
    finished.current = true;
    provider.current.stopNavigation();
    const end = new Date();
    if (demoOn) {
      const script = summariseScript(frames);
      const minutes = Math.max(1, Math.round((script.distanceM / 1000 / 32) * 60));
      setSummary({
        demo: true,
        origin: "Airport City",
        destination: "East Legon",
        distanceM: script.distanceM,
        minutes,
        compliance: script.compliance,
        harshBrakes: script.harshBrakes,
        harshAccels: script.harshAccels,
        comparison: null,
        closing: closingLine({ demo: true, compliance: script.compliance, harshBrakes: script.harshBrakes }),
        notes: ["Demonstration · scripted speeds and a scripted limit"],
        intelligence: DriverIntelligenceEngine.fromWorkspace(ws).assessTrip({
          demo: true,
          minutes,
          samples: script.samples.length,
          compliance: script.compliance,
          harshBrakes: script.harshBrakes,
          harshAccels: script.harshAccels,
          events: [],
        }, "Demonstration congestion is scripted. It is not live traffic."),
        saved: "no",
        saveError: "",
        held: false,
        sessionId: null,
      });
      setPhase("summary");
      setSheet("half");
      return;
    }
    const taken = samples.current;
    const harsh = countHarsh(taken);
    const compliance = taken.length ? speedCompliance(taken) : null;
    const previous = [...ws.sessions].reverse().find((session) => session.speedCompliance != null)?.speedCompliance ?? null;
    const distanceM = Math.round(progress?.traveledM || selected?.distanceM || 0);
    const minutes = Math.max(1, Math.round((end.getTime() - new Date(startedAt.current ?? end.toISOString()).getTime()) / 60_000));
    const noteList = [...new Set(notesRef.current)].slice(0, 8);
    const canSave = ws.mode === "user";
    setSummary({
      demo: false,
      origin: originLabel,
      destination: destination?.name ?? "Destination",
      distanceM,
      minutes,
      compliance,
      harshBrakes: harsh.brakes,
      harshAccels: harsh.accels,
      comparison: tripComparison(compliance, previous),
      closing: closingLine({ demo: false, compliance, harshBrakes: harsh.brakes }),
      notes: noteList,
      intelligence: DriverIntelligenceEngine.fromWorkspace(ws).assessTrip({
        demo: false,
        minutes,
        samples: taken.length,
        compliance,
        harshBrakes: harsh.brakes,
        harshAccels: harsh.accels,
        events: noteList,
      }, "Traffic is not available from this provider. Routes were ordered by estimated time."),
      saved: canSave ? "saving" : "no",
      saveError: "",
      held: false,
      sessionId: null,
    });
    setPhase("summary");
    setSheet("half");
    pushEvent(makeEvent({
      type: arrived ? "DESTINATION_REACHED" : "TRIP_ENDED",
      at: end.toISOString(),
      location: fix,
      source: "device",
      confidence: "high",
      metadata: { destination: destination?.name ?? "" },
    }));
    if (!canSave || !startedAt.current) return;
    const pending: PendingTrip = {
      clientId: startedAt.current,
      vehicleId: ws.activeVehicle?.id ?? null,
      startedAt: startedAt.current,
      endedAt: end.toISOString(),
      roadContext: "navigation",
      samples: taken.slice(0, 2000),
      harshBrakes: harsh.brakes,
      harshAccelerations: harsh.accels,
      originLabel,
      destinationLabel: destination?.name,
      distanceM,
      geometry: selected ? decimate(selected.geometry, 40) : undefined,
      notes: noteList,
      raining: (() => {
        try {
          return window.localStorage.getItem("nokware-field-rain") === "yes";
        } catch {
          return false;
        }
      })(),
    };
    const saved = await sendTrip(pending);
    setSummary((current) => current && {
      ...current,
      saved: saved.ok ? "saved" : "error",
      saveError: saved.ok ? "" : saved.keep ? "This trip is still on this phone." : saved.error,
      held: !saved.ok && saved.keep,
      sessionId: saved.id || null,
    });
    if (saved.ok) router.refresh();
  }

  async function sendTrip(pending: PendingTrip) {
    holdTrip(pending);
    try {
      const saved = await saveSessionAction(pending);
      if (saved.ok || !saved.keep) dropTrip();
      return saved;
    } catch {
      return { ok: false as const, error: "This trip is still on this phone.", id: "", keep: true };
    }
  }

  async function retrySave() {
    const pending = heldTrip();
    if (!pending || ws.mode !== "user") return;
    setSummary((current) => current && { ...current, saved: "saving", saveError: "", held: false });
    const saved = await sendTrip(pending);
    setSummary((current) => current && {
      ...current,
      saved: saved.ok ? "saved" : "error",
      saveError: saved.ok ? "" : saved.keep ? "This trip is still on this phone." : saved.error,
      held: !saved.ok && saved.keep,
      sessionId: saved.id || null,
    });
    if (saved.ok) {
      setBanner("The last trip is saved.");
      router.refresh();
    }
  }

  useEffect(() => {
    if (ws.mode !== "user") return;
    const pending = heldTrip();
    if (!pending) return;
    let cancel = false;
    void sendTrip(pending).then((saved) => {
      if (cancel || !saved.ok) {
        if (!cancel && saved.keep) setBanner("A trip is still on this phone.");
        return;
      }
      setBanner("The last trip is saved.");
      router.refresh();
    });
    return () => {
      cancel = true;
    };
  }, [router, ws.mode]);

  function allowLocation() {
    localStorage.setItem("nokware-location-consent", "yes");
    setConsent("yes");
    setExplain(false);
  }

  function declineLocation() {
    localStorage.setItem("nokware-location-consent", "no");
    setConsent("no");
    setExplain(false);
  }

  function setVoiceMode(mode: VoiceMode) {
    setVoice(mode);
    localStorage.setItem("nokware-nav-voice", mode);
    mergeDriveCookie({ voice: mode });
  }

  function setReroute(mode: RerouteMode) {
    setRerouteMode(mode);
    localStorage.setItem("nokware-nav-reroute", mode);
  }

  function setAppearanceMode(mode: AppearanceMode) {
    setAppearance(mode);
    localStorage.setItem("nokware-nav-appearance", mode);
  }

  function setLimit(value: number | null) {
    if (mapped) return;
    setDeclared(value);
    if (value == null) {
      pendingRoadSave.current = false;
      return;
    }
    if (roadName) {
      savedRoads.current = rememberRoadLimit(savedRoads.current, roadName, value);
      localStorage.setItem("nokware-road-limits", JSON.stringify(savedRoads.current));
      pendingRoadSave.current = false;
    } else {
      pendingRoadSave.current = true;
    }
    notesRef.current.push(`Limit you set: ${value} km/h`);
    pushEvent(makeEvent({ type: "SPEED_LIMIT_CHANGED", at: new Date().toISOString(), location: fix, source: "user", confidence: "low", metadata: { kph: value } }));
  }

  async function saveSlot(slot: PlaceView["slot"]) {
    if (!destination || ws.mode !== "user") {
      setPlaceNote(ws.mode === "demo" ? "The demo cannot store places." : "Choose a destination first.");
      return;
    }
    const result = await savePlaceAction({ slot, name: destination.name, address: destination.address, lat: destination.lat, lng: destination.lng });
    setPlaceNote(result.ok ? `Saved as ${slot}.` : result.error);
    if (result.ok) router.refresh();
  }

  function removeRecent(id: string) {
    const next = forgetPlace(recents, id);
    setRecents(next);
    localStorage.setItem(`nokware-recent-${ws.viewer.id}`, JSON.stringify(next));
  }

  async function removeTrip(id: string) {
    const result = await deleteSessionAction(id);
    if (!result.ok) {
      setPlaceNote(result.error);
      return;
    }
    setHiddenTrips((current) => [...current, id]);
    router.refresh();
  }

  async function discardSummary() {
    if (summary?.sessionId) await deleteSessionAction(summary.sessionId);
    setSummary(null);
    setPhase("browse");
    setDemoOn(false);
    router.refresh();
  }

  function openSearch() {
    if (moving && phase === "navigating") {
      setBanner("Pull over to search.");
      return;
    }
    originLocked.current = false;
    setOriginPinned(false);
    setSearchOpen(true);
  }

  const blankPin = (name: string, address: string): MapPin => ({
    name,
    address,
    kind: null,
    road: null,
    area: null,
    phone: null,
    website: null,
    hours: null,
    limitKph: null,
    source: "openstreetmap",
  });

  function pinHit(): PlaceHit | null {
    if (!pin) return null;
    return {
      id: `pin-${pin.lat.toFixed(5)}-${pin.lng.toFixed(5)}`,
      name: (pinPlace?.name || "Dropped pin").slice(0, 80),
      address: (pinPlace?.address || `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`).slice(0, 160),
      lat: pin.lat,
      lng: pin.lng,
    };
  }

  async function pickPoint(point: GeoPoint, known?: { name: string; address: string; phone?: string | null; hours?: string | null; keepName?: boolean }) {
    if (phase === "summary" || phase === "offer") return;
    const token = ++pinToken.current;
    setPin(point);
    setFollow(false);
    setPinNote("");
    setNearby([]);
    setNearbyBusy(false);
    if (phase === "preview") {
      setPhase("browse");
      setRoutes([]);
      setDestination(null);
      setStop(null);
    }
    if (!inGhana(point)) {
      setPinPlace(blankPin("Outside Ghana", "Routing is set up for places in Ghana."));
      setPinBusy(false);
      return;
    }
    setPinBusy(true);
    setPinPlace(blankPin(known?.name ?? "Dropped pin", known?.address ?? "Looking up this place on OpenStreetMap."));
    try {
      const response = await fetch(`/api/maps/reverse?lat=${point.lat}&lng=${point.lng}`, { signal: AbortSignal.timeout(8000) });
      const body = (await response.json()) as { place?: MapPin | null; busy?: boolean };
      if (token !== pinToken.current) return;
      if (body.place) {
        const next = known?.keepName
          ? { ...body.place, name: known.name, address: known.address || body.place.address, phone: known.phone ?? body.place.phone, hours: known.hours ?? body.place.hours, hoursSource: known.hours ? "USER_PROVIDED" as const : body.place.hoursSource }
          : known && body.place.name === "Dropped pin"
            ? { ...body.place, name: known.name, address: body.place.address || known.address }
            : body.place;
        setPinPlace(next);
      } else if (known?.keepName) {
        setPinPlace({ ...blankPin(known.name, known.address), phone: known.phone ?? null, hours: known.hours ?? null, hoursSource: known.hours ? "USER_PROVIDED" : undefined });
      } else if (body.busy) {
        setPinNote("OpenStreetMap is a little busy. You can still get directions.");
      } else if (!known) {
        setPinNote("The place name did not load. You can still get directions.");
      }
    } catch {
      if (token === pinToken.current && !known) setPinNote("The place name did not load. You can still get directions.");
    } finally {
      if (token === pinToken.current) setPinBusy(false);
    }
  }

  function pickSaved(id: string) {
    const saved = ws.places.find((place) => place.id === id);
    if (!saved) return;
    void pickPoint({ lat: saved.lat, lng: saved.lng }, { name: saved.name, address: saved.address });
  }

  function clearPin() {
    pinToken.current += 1;
    setPin(null);
    setPinPlace(null);
    setPinBusy(false);
    setPinNote("");
    setNearby([]);
  }

  function directionsToPin() {
    const hit = pinHit();
    if (!hit) return;
    if (moving && (phase === "navigating" || phase === "recalculating")) {
      setPinNote("Pull over to change the route.");
      return;
    }
    if (!inGhana(hit)) {
      setPinNote("Routing is set up for places in Ghana.");
      return;
    }
    originLocked.current = false;
    setOriginPinned(false);
    void choose(hit);
  }

  async function departFromPin() {
    const hit = pinHit();
    if (!hit) return;
    if (moving && (phase === "navigating" || phase === "recalculating")) {
      setPinNote("Pull over to change the route.");
      return;
    }
    if (!inGhana(hit)) {
      setPinNote("Routing is set up for places in Ghana.");
      return;
    }
    originLocked.current = true;
    originRef.current = hit;
    setOrigin(hit);
    setOriginLabel(hit.name);
    setOriginIsUser(false);
    setOriginPinned(true);
    if (destination) {
      setPin(null);
      setPhase("preview");
      setRouteError("");
      setDemoOn(false);
      const result = await services.current.navigation.calculateRoute(hit, destination, travelMode, stop);
      if (!result.ok) {
        setRoutes([]);
        setRouteError(result.message);
        return;
      }
      setRoutes(result.routes);
      setSelectedId(result.routes[0].id);
      setLastRouteAt(Date.now());
      setFitToken((value) => value + 1);
      return;
    }
    setSearchOpen(true);
    setBanner(`Starting from ${hit.name}. Choose where to go.`);
  }

  async function addStop() {
    const hit = pinHit();
    if (!hit) return;
    if (moving && (phase === "navigating" || phase === "recalculating")) {
      setPinNote("Pull over to change the route.");
      return;
    }
    if (!destination) {
      setPinNote("Choose where you are going, then add one stop.");
      return;
    }
    if (!inGhana(hit)) {
      setPinNote("Routing is set up for places in Ghana.");
      return;
    }
    const gate = destinationAllowed(`${hit.name} ${hit.address}`);
    if (!gate.ok) {
      setPinNote(gate.reason);
      return;
    }
    if (haversine(hit, destination) < 40) {
      setPinNote("That is already the destination.");
      return;
    }
    const from = originLocked.current ? originRef.current : (fix ?? origin);
    if (haversine(hit, from) < 40) {
      setPinNote("That is where this route starts.");
      return;
    }
    if (stop && haversine(hit, stop) < 40) {
      setPinNote("That stop is already on the route.");
      return;
    }
    const result = await services.current.navigation.calculateRoute(from, destination, travelMode, hit);
    if (!result.ok) {
      setRouteError(result.message);
      setPinNote(result.message);
      return;
    }
    setStop(hit);
    setPinNote(`Stop added. The route still ends at ${destination.name}.`);
    setRouteError("");
    setRoutes(result.routes);
    setSelectedId(result.routes[0].id);
    setPhase("preview");
    setLastRouteAt(Date.now());
    setFitToken((value) => value + 1);
  }

  async function clearStop() {
    if (!destination) {
      setStop(null);
      return;
    }
    const from = originLocked.current ? originRef.current : (fix ?? origin);
    const result = await services.current.navigation.calculateRoute(from, destination, travelMode, null);
    if (!result.ok) {
      setRouteError(result.message);
      return;
    }
    setStop(null);
    setRouteError("");
    setRoutes(result.routes);
    setSelectedId(result.routes[0].id);
    setLastRouteAt(Date.now());
    setFitToken((value) => value + 1);
  }

  async function savePin(slot: PlaceView["slot"]) {
    const hit = pinHit();
    if (!hit || ws.mode !== "user") {
      setPinNote(ws.mode === "demo" ? "The demo cannot store places." : "Choose a place first.");
      return;
    }
    const result = await savePlaceAction({ slot, name: hit.name, address: hit.address, lat: hit.lat, lng: hit.lng });
    setPinNote(result.ok ? `Saved as ${slot}.` : result.error);
    if (result.ok) router.refresh();
  }

  async function sharePin() {
    const hit = pinHit();
    if (!hit) return;
    const text = `${hit.name}\n${hit.address}\n${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)}\nOpenStreetMap`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: hit.name, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setPinNote("Copied the place.");
    } catch {
      setPinNote("Copy it from the coordinates below.");
    }
  }

  async function findNearby(query: string) {
    if (!pin) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setPinNote("Nearby search needs a connection. Places already listed stay on this screen.");
      return;
    }
    setNearbyBusy(true);
    setPinNote("");
    try {
      const response = await fetch(`/api/maps/nearby?lat=${pin.lat}&lng=${pin.lng}&q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(9000) });
      const body = (await response.json()) as { ok?: boolean; places?: PlaceHit[]; message?: string };
      if (!body.ok) {
        setNearby([]);
        setPinNote(body.message ?? "Nearby search is temporarily unavailable.");
        return;
      }
      const places = withDistance(body.places ?? [], pin);
      setNearby(places);
      if (!places.length) setPinNote("Nothing mapped nearby for that.");
    } catch {
      setPinNote("Nearby search is temporarily unavailable.");
    } finally {
      setNearbyBusy(false);
    }
  }

  function retryMap() {
    if (providerOff) return;
    setMapFailed(false);
    setMapKey((value) => value + 1);
  }

  function failMap() {
    setMapFailed(true);
  }

  function listen() {
    const host = window as Window & { webkitSpeechRecognition?: new () => { lang: string; start: () => void; onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null } };
    const Recognition = host.webkitSpeechRecognition;
    if (!Recognition) {
      setSearchError("Voice search is not available in this browser.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-GB";
    recognition.onresult = (event) => {
      setQuery(event.results[0][0].transcript);
      setSearchOpen(true);
    };
    recognition.start();
  }

  const status = movementStatus(speed, limit.kph);
  const gpsLine = demoOn
    ? "Not your GPS. Not the vehicle speedometer."
    : consent === "no" || loc === "denied"
      ? "GPS is off. Turn it on to read a speed."
      : loc === "unavailable"
        ? "This phone has no GPS reading."
        : fix?.line ?? (consent === "yes" ? (gpsSlow ? "Still looking for GPS. Move into open sky if this stays blank." : "Looking for GPS.") : "GPS speed unavailable.");
  const shownResults = withDistance(results, fix);
  const shownRecents = withDistance(recents, fix);
  const failure = mapFailed ? mapFailureMessage(providerOff ? "off" : "down") : null;
  const where = locationMessage(locKind);

  return {
    ws,
    providerOff,
    phase,
    query,
    setQuery,
    results: shownResults,
    searching,
    searchError,
    searchOpen,
    setSearchOpen,
    recents: shownRecents,
    destination,
    originLabel,
    originIsUser,
    originPinned,
    routes,
    selected,
    routeError,
    travelMode,
    changeMode,
    demoOn,
    frame,
    paused,
    setPaused,
    fix,
    follow,
    setFollow,
    fitToken,
    mapFailed,
    mapKey,
    night,
    voice,
    setVoiceMode,
    rerouteMode,
    setReroute,
    appearance,
    setAppearanceMode,
    declared,
    roadName,
    setLimit,
    online,
    freshness: freshness(lastRouteAt, Date.now()),
    summary,
    offer,
    banner,
    sheet,
    setSheet,
    layersOpen,
    setLayersOpen,
    showPlaces,
    setShowPlaces,
    historyWindow,
    setHistoryWindow,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    hiddenTrips,
    placeNote,
    events,
    speed,
    speedKnown,
    gpsLine,
    consentReady,
    bearing,
    headingKnown,
    limit,
    upcoming,
    progress,
    instruction,
    thenCue,
    turn: turnPoint,
    etaMin,
    etaLabel: etaMin == null ? null : etaClock(new Date(), etaMin),
    status,
    lines,
    puck: puckPoint
      ? {
          ...puckPoint,
          bearing,
          accuracyM: frame ? null : (fix?.accuracy ?? null),
          demo: Boolean(frame),
          circleAt: !frame && onRoute && fix ? { lat: fix.lat, lng: fix.lng } : undefined,
        }
      : null,
    center: puckPoint ?? selected?.geometry[0] ?? ACCRA_CENTRE,
    moving,
    explain,
    setExplain,
    consent,
    allowLocation,
    declineLocation,
    where,
    failure,
    trafficNote: frame?.alert?.id === "congestion" ? "Demonstration · scripted congestion. Not live traffic." : TRAFFIC_NOTE,
    roadNotes: roadNotesFor(frame?.alert ?? null),
    choose,
    pickPoint,
    pickSaved,
    clearPin,
    directionsToPin,
    addStop,
    clearStop,
    stop,
    departFromPin,
    savePin,
    sharePin,
    findNearby,
    pin,
    pinPlace,
    pinBusy,
    pinNote,
    nearby,
    nearbyBusy,
    start,
    playDemo,
    acceptOffer,
    keepRoute: () => {
      setOffer(null);
      setBanner("Keeping this route");
      setPhase("navigating");
    },
    finish: () => void finish(false),
    openSearch,
    retryMap,
    listen,
    saveSlot,
    removeRecent,
    removeTrip,
    discardSummary,
    retrySave,
    closePreview: () => {
      originLocked.current = false;
      setOriginPinned(false);
      setPin(null);
      setPhase("browse");
      setRoutes([]);
      setDestination(null);
      setStop(null);
      setRouteError("");
      setDemoOn(false);
      setSummary(null);
      setOffer(null);
    },
    failMap,
    selectRoute: (id: string) => {
      setSelectedId(id);
      setFitToken((value) => value + 1);
    },
    voiceSearchAvailable,
    readiness: DriverIntelligenceEngine.fromWorkspace(ws).readiness(),
    coaching: DriverIntelligenceEngine.fromWorkspace(ws).coaching(),
    providerNotes: unsupportedNotes(demoOn ? demoCapabilities() : openCapabilities(mapProviderId() !== "off")),
  };
}
