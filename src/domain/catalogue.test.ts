import { describe, expect, it } from "vitest";
import { callablePhone, estimateShare, fuelEstimate, localPlaceHits, mergePlaceHits, nearbyAllowed, nearbyKind, placeHours, placePhone, placesForQuery, routeHoldFrom, spellingClose, tripShare } from "./catalogue";
import { fuelPriceNote, ownStandingNote, submitPlace, blankField, confirmPlace, countryById, editPlace, publicPlaces } from "./field";

describe("catalogue", () => {
  it("keeps a phone and hours only when they are usable", () => {
    expect(placePhone("")).toBe("");
    expect(placePhone("+233 24 000 0000")).toBe("+233 24 000 0000");
    expect(placePhone("call me")).toBeNull();
    expect(callablePhone("+233 24 000 0000")).toBe("+233240000000");
    expect(callablePhone("191")).toBe("");
    expect(placeHours("Mo-Fr 08:00-17:00")).toBe("Mo-Fr 08:00-17:00");
    expect(placeHours("<script>")).toBeNull();
    const state = blankField();
    expect(submitPlace(state, { id: "bad", userId: "a", country: "gh", kind: "market", name: "Makola", note: "", lat: 5.55, lng: -0.2, createdAt: "2026-11-07T10:00:00.000Z", phone: "nope" }).ok).toBe(false);
    submitPlace(state, { id: "market", userId: "a", country: "gh", kind: "market", name: "Makola", note: "main gate", lat: 5.55, lng: -0.2, createdAt: "2026-11-07T10:00:00.000Z", phone: "+233 30 000 0000", hours: "Mo-Sa 08:00-18:00" });
    confirmPlace(state, "market", "b");
    const shown = publicPlaces(state, "gh")[0];
    expect(shown.phone).toBe("+233 30 000 0000");
    expect(shown.hours).toBe("Mo-Sa 08:00-18:00");
    expect(placesForQuery(publicPlaces(state, "gh"), "market", { lat: 5.55, lng: -0.2 })).toHaveLength(1);
    expect(placesForQuery(publicPlaces(state, "gh"), "police", { lat: 5.55, lng: -0.2 })).toHaveLength(0);
    expect(nearbyAllowed("trotro")).toBe(true);
    expect(nearbyKind("fuel station")).toBe("fuel");
    expect(nearbyAllowed("checkpoint")).toBe(false);
    expect(nearbyKind("mosque")).toBe("mosque");
    expect(countryById("gh")?.reportKinds.some((kind) => kind.id === "fallen_tree")).toBe(true);
    expect(countryById("gh")?.reportKinds.some((kind) => kind.id === "checkpoint")).toBe(false);
    editPlace(state, { id: "market", userId: "a", name: "Makola market", note: "east gate", phone: "+233 30 000 0000", hours: "Mo-Sa 08:00-18:00", services: "vegetables" });
    expect(publicPlaces(state, "gh")).toHaveLength(0);
    expect(state.places[0].status).toBe("open");
    expect(state.places[0].services).toBe("vegetables");
  });

  it("matches a saved name with one letter off and keeps the map result beside it", () => {
    expect(spellingClose("madna", "Madina station")).toBe(true);
    expect(spellingClose("ma", "Madina")).toBe(false);
    expect(spellingClose("zz", "Madina")).toBe(false);
    const local = localPlaceHits("madna", [{ id: "home", name: "Madina station", address: "Saved", lat: 5.68, lng: -0.17 }], []);
    expect(local[0].source).toBe("USER_PROVIDED");
    const merged = mergePlaceHits(local, [{ id: "osm", name: "Other", address: "OpenStreetMap", lat: 5.6, lng: -0.19 }]);
    expect(merged.map((hit) => hit.id)).toEqual(["home", "osm"]);
  });

  it("calculates fuel only from figures the driver entered", () => {
    expect(fuelEstimate(10_000, null, 14)).toBeNull();
    expect(fuelEstimate(10_000, 1, 14)).toBeNull();
    const priced = fuelEstimate(10_000, 8, 15);
    expect(priced?.litres).toBe(0.8);
    expect(priced?.costGhs).toBe(12);
    expect(priced?.note).toMatch(/not a station bill/);
    expect(fuelEstimate(10_000, 8, null)?.costGhs).toBeNull();
  });

  it("shares an estimate and a saved trip without calling either one live", () => {
    expect(estimateShare({ destination: "Madina", duration: "20 min", distance: "8 km", at: "14:00", traffic: "Traffic is not available from this provider.", extra: "" })).toMatch(/not a live arrival/);
    expect(tripShare({ origin: "Home", destination: "Madina", when: "2026-11-07", distance: "8 km", minutes: 20, compliance: 90 })).toMatch(/not a live location/);
  });

  it("keeps a route on the phone for six hours and drops an old one", () => {
    const route = {
      id: "a",
      label: "Recommended" as const,
      durationS: 600,
      distanceM: 5000,
      geometry: [{ lat: 5.6, lng: -0.18 }, { lat: 5.61, lng: -0.17 }],
      steps: [],
      trafficAvailable: false as const,
      trafficNote: "Traffic is not available from this provider.",
    };
    const now = Date.parse("2026-11-07T12:00:00.000Z");
    const held = routeHoldFrom({ at: now - 1000, destination: { id: "d", name: "Madina", address: "Accra", lat: 5.68, lng: -0.17 }, routes: [route], selectedId: "a" }, now);
    expect(held?.selectedId).toBe("a");
    expect(routeHoldFrom({ at: now - 7 * 60 * 60 * 1000, destination: held?.destination, routes: [route], selectedId: "a" }, now)).toBeNull();
    expect(routeHoldFrom({ at: now, destination: { id: "d", name: "Away", address: "", lat: 40, lng: 10 }, routes: [route] }, now)).toBeNull();
  });

  it("names the nearest confirmed fuel price and the account's own standing", () => {
    const note = fuelPriceNote([
      { id: "p", country: "gh", kind: "fuel_price", lat: 5.55, lng: -0.2, cell: "5.550,-0.200", reporterId: "a", note: "", priceGhs: 14.2, createdAt: "2026-11-07T08:00:00.000Z", confirmations: ["b"], disputes: [], status: "confirmed", credited: true, penalised: false, source: "USER_PROVIDED" },
    ], { lat: 5.551, lng: -0.2 }, new Date("2026-11-07T10:00:00.000Z"));
    expect(note).toMatch(/GH₵ 14.2/);
    expect(note).toMatch(/Not a station price list/);
    expect(fuelPriceNote([], { lat: 5.55, lng: -0.2 }, new Date())).toBeNull();
    expect(ownStandingNote(undefined)).toMatch(/not a public rank/);
    expect(ownStandingNote({ submitted: 3, confirmedByOthers: 0, hidden: 3 })).toMatch(/sent 3/i);
    expect(ownStandingNote({ submitted: 3, confirmedByOthers: 0, hidden: 3 })).not.toMatch(/two other|confirm/i);
  });
});
