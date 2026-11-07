"use client";

import "leaflet/dist/leaflet.css";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Circle, LayerGroup, Map as LeafletMap, Marker, Polyline, TileLayer } from "leaflet";
import { clusterOpenZoom, clusterPins, lookAhead, type GeoPoint } from "@/domain/navigation";
import { vehicleMarkup, type VehicleMark } from "@/domain/vehicle-look";

export interface MapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  frame: (zoom: number, aheadM: number, fit: boolean) => void;
  show: (point: GeoPoint, zoom: number) => void;
}

export interface MapLine {
  id: string;
  points: GeoPoint[];
  active: boolean;
  faded?: boolean;
}

interface Props {
  night: boolean;
  center: GeoPoint;
  zoom: number;
  /** Metres to look ahead of the puck. Zero keeps the camera on the puck. */
  aheadM: number;
  /** Bumps when a view button asks for a new camera. */
  cameraToken: number;
  cameraFit: boolean;
  follow: boolean;
  fitToken: number;
  puck: { lat: number; lng: number; bearing: number; accuracyM: number | null; demo: boolean; circleAt?: { lat: number; lng: number } } | null;
  mark: VehicleMark;
  lines: MapLine[];
  places: { id: string; name: string; lat: number; lng: number }[];
  sketch?: GeoPoint[];
  /** Close the sketch into a ring. A line stays open. */
  sketchClosed?: boolean;
  pin: GeoPoint | null;
  /** Where the current route ends, while navigating. */
  end?: { lat: number; lng: number; name: string } | null;
  /** The next turn on the route. */
  turn?: GeoPoint | null;
  onPick: (point: GeoPoint) => void;
  onPlace: (id: string) => void;
  onUserMove: () => void;
  onFail: () => void;
}

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export const MapCanvas = forwardRef<MapHandle, Props>(function MapCanvas(props, ref) {
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tilesRef = useRef<TileLayer | null>(null);
  const groupRef = useRef<LayerGroup | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const markerKeyRef = useRef("");
  const glideRef = useRef(0);
  const pinRef = useRef<Marker | null>(null);
  const endRef = useRef<Marker | null>(null);
  const turnRef = useRef<Marker | null>(null);
  const drawnLines = useRef(new Set<string>());
  const accuracyRef = useRef<Circle | null>(null);
  const linesRef = useRef<Polyline[]>([]);
  const failRef = useRef(props.onFail);
  const moveRef = useRef(props.onUserMove);
  const pickRef = useRef(props.onPick);
  const placePickRef = useRef(props.onPlace);
  const errors = useRef(0);
  const loaded = useRef(0);
  const propsRef = useRef(props);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(props.zoom);
  propsRef.current = props;
  failRef.current = props.onFail;
  moveRef.current = props.onUserMove;
  pickRef.current = props.onPick;
  placePickRef.current = props.onPlace;

  useImperativeHandle(ref, () => ({
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    frame: (zoom, aheadM, fit) => fly(mapRef.current, propsRef.current, zoom, aheadM, fit),
    show: (point, zoom) => mapRef.current?.flyTo([point.lat, point.lng], Math.min(19, Math.max(5, zoom)), { duration: 0.45 }),
  }));

  useEffect(() => {
    let dead = false;
    let map: LeafletMap | null = null;
    (async () => {
      const leaflet = await import("leaflet");
      if (dead || !holder.current || mapRef.current) return;
      map = leaflet.map(holder.current, {
        zoomControl: false,
        attributionControl: true,
        minZoom: 5,
        maxZoom: 19,
        zoomSnap: 1,
        zoomDelta: 1,
        wheelPxPerZoomLevel: 60,
      });
      map.setView([props.center.lat, props.center.lng], props.zoom);
      leaflet.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
      groupRef.current = leaflet.layerGroup().addTo(map);
      const live = map;
      live.on("zoomend", () => setZoom(live.getZoom()));
      map.on("dragstart", () => moveRef.current());
      map.on("click", (event: { latlng: { lat: number; lng: number } }) => {
        pickRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
      });
      mapRef.current = map;
      setReady(true);
    })().catch(() => failRef.current());
    return () => {
      dead = true;
      map?.remove();
      mapRef.current = null;
      setReady(false);
      tilesRef.current = null;
      groupRef.current = null;
      markerRef.current = null;
      pinRef.current = null;
      endRef.current = null;
      turnRef.current = null;
      accuracyRef.current = null;
      linesRef.current = [];
    };
    // Mount once. Later effects move the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let dead = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (dead || !mapRef.current) return;
      tilesRef.current?.remove();
      errors.current = 0;
      if (!ready) return;
      const tiles = leaflet.tileLayer(TILES, {
        attribution: ATTRIBUTION,
        minZoom: 5,
        maxZoom: 19,
        maxNativeZoom: 19,
        keepBuffer: 3,
        updateWhenIdle: false,
      });
      tiles.on("tileload", () => {
        loaded.current += 1;
      });
      tiles.on("tileerror", () => {
        errors.current += 1;
        if (loaded.current === 0 && errors.current === 6) failRef.current();
      });
      tiles.addTo(mapRef.current);
      tilesRef.current = tiles;
    })();
    return () => {
      dead = true;
    };
  }, [ready, props.night]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !props.follow || !props.puck) return;
    const target = aim(props.puck, props.aheadM);
    map.panTo([target.lat, target.lng], { animate: true, duration: props.aheadM > 0 ? 0.35 : 0.55 });
  }, [ready, props.follow, props.puck, props.aheadM]);

  useEffect(() => {
    if (!ready || props.cameraToken === 0) return;
    fly(mapRef.current, props, props.zoom, props.aheadM, props.cameraFit);
  }, [ready, props.cameraToken]);

  const lineKey = props.lines.map((line) => `${line.id}:${line.active ? 1 : 0}:${line.faded ? 1 : 0}:${line.points.length}:${line.points[0]?.lat ?? 0}`).join("|");
  const placeKey = props.places.map((place) => `${place.id}:${place.lat.toFixed(5)},${place.lng.toFixed(5)}`).join("|");
  const sketchKey = (props.sketch ?? []).map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`).join("|");

  useEffect(() => {
    const map = mapRef.current;
    const points = props.lines.flatMap((line) => line.points);
    if (!ready || !map || props.fitToken === 0 || points.length < 2) return;
    map.fitBounds(points.map((point) => [point.lat, point.lng] as [number, number]), { paddingTopLeft: [48, 120], paddingBottomRight: [72, 300], maxZoom: 16, animate: true, duration: 0.6 });
    // Fit when a route is chosen, not on every position tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.fitToken]);

  useEffect(() => {
    let dead = false;
    (async () => {
      const leaflet = await import("leaflet");
      const group = groupRef.current;
      if (dead || !ready || !group) return;
      linesRef.current.forEach((line) => line.remove());
      linesRef.current = [];
      group.clearLayers();
      const zoomNow = mapRef.current?.getZoom() ?? zoom;
      for (const groupPin of clusterPins(props.places, zoomNow)) {
        const clustered = groupPin.count > 1;
        const dot = leaflet.circleMarker([groupPin.lat, groupPin.lng], {
          radius: clustered ? 12 : 6,
          color: "#8a6234",
          weight: 2,
          fillColor: clustered ? "#8a6234" : "#f4f1ea",
          fillOpacity: 1,
        });
        dot.bindTooltip(groupPin.name, { direction: "top", offset: [0, -6] });
        dot.on("click", (event) => {
          leaflet.DomEvent.stopPropagation(event);
          if (clustered) {
            mapRef.current?.fitBounds(groupPin.places.map((place) => [place.lat, place.lng] as [number, number]), { padding: [48, 48], maxZoom: clusterOpenZoom(zoomNow), animate: true });
            return;
          }
          placePickRef.current(groupPin.ids[0]);
        });
        if (clustered) {
          leaflet.tooltip({ permanent: true, direction: "center", className: "nk-cluster", offset: [0, 0] }).setContent(String(groupPin.count)).setLatLng([groupPin.lat, groupPin.lng]).addTo(group);
        }
        dot.addTo(group);
      }
      const sketch = props.sketch ?? [];
      if (sketch.length >= 2) {
        const ring = props.sketchClosed && sketch.length >= 3 ? [...sketch, sketch[0]] : sketch;
        leaflet.polyline(ring.map((point) => [point.lat, point.lng] as [number, number]), { color: "#8a6234", weight: 3, dashArray: "6 6" }).addTo(group);
      }
      for (const line of props.lines) {
        if (line.points.length < 2) continue;
        const coords = line.points.map((point) => [point.lat, point.lng] as [number, number]);
        const close = zoomNow >= 16;
        const casing = leaflet.polyline(coords, {
          color: line.faded ? "#f4f1ea" : "#fbf9f4",
          weight: line.active ? (close ? 12 : 18) : line.faded ? 8 : 10,
          opacity: line.faded ? 0.35 : 0.96,
          lineCap: "round",
          lineJoin: "round",
        });
        const drawn = leaflet.polyline(coords, {
          color: line.active ? "#161712" : line.faded ? "#b7b1a4" : "#8a6234",
          weight: line.active ? (close ? 5 : 7) : 4,
          opacity: line.faded ? 0.55 : 1,
          lineCap: "round",
          lineJoin: "round",
        });
        casing.addTo(group);
        drawn.addTo(group);
        linesRef.current.push(casing, drawn);
        const stroke = drawn.getElement() as SVGPathElement | undefined;
        if (stroke && line.active && !line.faded && !drawnLines.current.has(line.id)) {
          drawnLines.current.add(line.id);
          const length = typeof stroke.getTotalLength === "function" ? stroke.getTotalLength() : 800;
          stroke.style.strokeDasharray = `${length}`;
          stroke.style.strokeDashoffset = `${length}`;
          stroke.getBoundingClientRect();
          const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          stroke.style.transition = reduce ? "none" : "stroke-dashoffset 700ms ease";
          stroke.style.strokeDashoffset = "0";
        }
      }
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lineKey, placeKey, sketchKey, props.sketchClosed, zoom]);

  useEffect(() => {
    let dead = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (dead || !ready || !mapRef.current) return;
      accuracyRef.current?.remove();
      accuracyRef.current = null;
      if (!props.puck) {
        markerRef.current?.remove();
        markerRef.current = null;
        return;
      }
      if (props.puck.accuracyM && props.puck.accuracyM > 0 && !props.puck.demo) {
        const circle = props.puck.circleAt ?? props.puck;
        accuracyRef.current = leaflet.circle([circle.lat, circle.lng], {
          radius: props.puck.accuracyM,
          color: "#8a6234",
          weight: 1,
          fillOpacity: 0.08,
        }).addTo(mapRef.current);
      }
      const markKey = `${props.mark.body}|${props.mark.paint}|${props.mark.stripe ?? ""}|${props.mark.name}|${props.puck.demo ? "demo" : "live"}`;
      const html = `<div class="nk-vehicle" style="transform:rotate(${Math.round(props.puck.bearing)}deg)"><i class="nk-heading"></i>${vehicleMarkup(props.mark, props.puck.demo)}</div>`;
      const icon = leaflet.divIcon({ className: "nk-vehicle-wrap", html, iconSize: [64, 92], iconAnchor: [32, 46] });
      const marker = markerRef.current;
      if (marker && markerKeyRef.current === markKey) {
        const face = marker.getElement()?.querySelector(".nk-vehicle") as HTMLElement | null;
        if (face) face.style.transform = `rotate(${Math.round(props.puck.bearing)}deg)`;
      } else if (marker) {
        marker.setIcon(icon);
        markerKeyRef.current = markKey;
      } else {
        markerRef.current = leaflet.marker([props.puck.lat, props.puck.lng], { icon, interactive: false, zIndexOffset: 600 }).addTo(mapRef.current);
        markerKeyRef.current = markKey;
      }
      const current = markerRef.current;
      if (!current) return;
      const from = current.getLatLng();
      const toLat = props.puck.lat;
      const toLng = props.puck.lng;
      const distance = from.distanceTo(leaflet.latLng(toLat, toLng));
      window.cancelAnimationFrame(glideRef.current);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (distance < 0.4 || distance > 500 || reduce) {
        current.setLatLng([toLat, toLng]);
        return;
      }
      const started = performance.now();
      const duration = Math.min(1200, Math.max(450, distance * 35));
      const step = (now: number) => {
        if (dead || markerRef.current !== current) return;
        const t = Math.min(1, (now - started) / duration);
        current.setLatLng([from.lat + (toLat - from.lat) * t, from.lng + (toLng - from.lng) * t]);
        if (t < 1) glideRef.current = window.requestAnimationFrame(step);
      };
      glideRef.current = window.requestAnimationFrame(step);
    })();
    return () => {
      dead = true;
      window.cancelAnimationFrame(glideRef.current);
    };
  }, [ready, props.puck?.lat, props.puck?.lng, props.puck?.bearing, props.puck?.demo, props.puck?.accuracyM, props.puck?.circleAt?.lat, props.puck?.circleAt?.lng, props.mark.body, props.mark.paint, props.mark.stripe, props.mark.name]);

  useEffect(() => {
    let dead = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (dead || !ready || !mapRef.current) return;
      if (!props.pin) {
        pinRef.current?.remove();
        pinRef.current = null;
        return;
      }
      const icon = leaflet.divIcon({
        className: "nk-pin-wrap",
        html: `<div class="nk-pin"></div>`,
        iconSize: [28, 36],
        iconAnchor: [14, 34],
      });
      if (pinRef.current) {
        pinRef.current.setLatLng([props.pin.lat, props.pin.lng]);
        pinRef.current.setIcon(icon);
        return;
      }
      const marker = leaflet.marker([props.pin.lat, props.pin.lng], { icon, interactive: true, zIndexOffset: 500 }).addTo(mapRef.current);
      marker.on("click", (event) => leaflet.DomEvent.stopPropagation(event));
      pinRef.current = marker;
    })();
    return () => {
      dead = true;
    };
  }, [ready, props.pin]);

  useEffect(() => {
    let dead = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (dead || !ready || !mapRef.current) return;
      const map = mapRef.current;
      if (!props.turn) {
        turnRef.current?.remove();
        turnRef.current = null;
      } else if (turnRef.current) {
        turnRef.current.setLatLng([props.turn.lat, props.turn.lng]);
      } else {
        const icon = leaflet.divIcon({ className: "nk-pin-wrap", html: `<div class="nk-turn"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
        turnRef.current = leaflet.marker([props.turn.lat, props.turn.lng], { icon, interactive: false, zIndexOffset: 450 }).addTo(map);
      }
      if (!props.end) {
        endRef.current?.remove();
        endRef.current = null;
      } else if (endRef.current) {
        endRef.current.setLatLng([props.end.lat, props.end.lng]);
      } else {
        const icon = leaflet.divIcon({ className: "nk-pin-wrap", html: `<div class="nk-pin"></div>`, iconSize: [28, 36], iconAnchor: [14, 34] });
        const marker = leaflet.marker([props.end.lat, props.end.lng], { icon, interactive: false, zIndexOffset: 480 }).addTo(map);
        marker.bindTooltip(props.end.name, { direction: "top", offset: [0, -30], permanent: true });
        endRef.current = marker;
      }
    })();
    return () => {
      dead = true;
    };
  }, [ready, props.turn, props.end]);

  return <div ref={holder} className={`h-full w-full ${props.night ? "map-night" : ""}`} />;
});

function aim(puck: { lat: number; lng: number; bearing: number }, aheadM: number): GeoPoint {
  return lookAhead({ lat: puck.lat, lng: puck.lng }, puck.bearing, aheadM);
}

function fly(map: LeafletMap | null, props: Props, zoom: number, aheadM: number, fit: boolean) {
  if (!map) return;
  const clamped = Math.min(19, Math.max(5, zoom));
  if (fit) {
    const points = props.lines.flatMap((line) => line.points);
    if (points.length >= 2) {
      map.fitBounds(points.map((point) => [point.lat, point.lng] as [number, number]), { paddingTopLeft: [48, 180], paddingBottomRight: [72, 160], maxZoom: 12, animate: true, duration: 0.55 });
      return;
    }
  }
  const target = props.puck ? aim(props.puck, aheadM) : props.center;
  map.flyTo([target.lat, target.lng], clamped, { duration: 0.5 });
}
