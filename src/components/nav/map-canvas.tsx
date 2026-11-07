"use client";

import "leaflet/dist/leaflet.css";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Circle, LayerGroup, Map as LeafletMap, Marker, Polyline, TileLayer } from "leaflet";
import { lookAhead, type GeoPoint } from "@/domain/navigation";

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
  lines: MapLine[];
  places: { id: string; name: string; lat: number; lng: number }[];
  pin: GeoPoint | null;
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
  const pinRef = useRef<Marker | null>(null);
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
        zoomSnap: 0,
        zoomDelta: 1,
        wheelPxPerZoomLevel: 50,
      });
      map.setView([props.center.lat, props.center.lng], props.zoom);
      leaflet.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
      groupRef.current = leaflet.layerGroup().addTo(map);
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
        subdomains: "abcd",
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

  useEffect(() => {
    const map = mapRef.current;
    const points = props.lines.flatMap((line) => line.points);
    if (!ready || !map || props.fitToken === 0 || points.length < 2) return;
    map.fitBounds(points.map((point) => [point.lat, point.lng] as [number, number]), { padding: [64, 64], maxZoom: 15, animate: true, duration: 0.6 });
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
      for (const place of props.places) {
        const dot = leaflet.circleMarker([place.lat, place.lng], { radius: 6, color: "#8a6234", weight: 2, fillColor: "#f4f1ea", fillOpacity: 1 });
        dot.bindTooltip(place.name, { direction: "top", offset: [0, -6] });
        dot.on("click", (event) => {
          leaflet.DomEvent.stopPropagation(event);
          placePickRef.current(place.id);
        });
        dot.addTo(group);
      }
      for (const line of props.lines) {
        if (line.points.length < 2) continue;
        const coords = line.points.map((point) => [point.lat, point.lng] as [number, number]);
        const casing = leaflet.polyline(coords, {
          color: line.faded ? "#d9d0c2" : "#2c261f",
          weight: line.active ? 12 : 8,
          opacity: line.faded ? 0.25 : 0.55,
          lineCap: "round",
          lineJoin: "round",
        });
        const drawn = leaflet.polyline(coords, {
          color: line.faded ? "#b9a58a" : "#c4a574",
          weight: line.active ? 6 : 4,
          opacity: line.faded ? 0.4 : line.active ? 1 : 0.55,
          lineCap: "round",
          lineJoin: "round",
        });
        casing.addTo(group);
        drawn.addTo(group);
        linesRef.current.push(casing, drawn);
        const stroke = drawn.getElement() as SVGPathElement | undefined;
        if (stroke && line.active && !line.faded) {
          const length = typeof stroke.getTotalLength === "function" ? stroke.getTotalLength() : 800;
          stroke.style.strokeDasharray = `${length}`;
          stroke.style.strokeDashoffset = `${length}`;
          stroke.getBoundingClientRect();
          stroke.style.transition = "stroke-dashoffset 700ms ease";
          stroke.style.strokeDashoffset = "0";
        }
      }
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lineKey, placeKey]);

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
      const icon = leaflet.divIcon({
        className: "nk-puck-wrap",
        html: `<div class="nk-puck" data-demo="${props.puck.demo ? "true" : "false"}" style="transform:rotate(${Math.round(props.puck.bearing)}deg)"><b></b><span></span><i></i></div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      if (markerRef.current) {
        markerRef.current.setLatLng([props.puck.lat, props.puck.lng]);
        markerRef.current.setIcon(icon);
        return;
      }
      markerRef.current = leaflet.marker([props.puck.lat, props.puck.lng], { icon, interactive: false }).addTo(mapRef.current);
    })();
    return () => {
      dead = true;
    };
  }, [ready, props.puck]);

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
      map.fitBounds(points.map((point) => [point.lat, point.lng] as [number, number]), { padding: [64, 64], maxZoom: 12, animate: true, duration: 0.55 });
      return;
    }
  }
  const target = props.puck ? aim(props.puck, aheadM) : props.center;
  map.flyTo([target.lat, target.lng], clamped, { duration: 0.5 });
}
