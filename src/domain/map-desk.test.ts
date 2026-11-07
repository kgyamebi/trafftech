import { describe, expect, it } from "vitest";
import { mapDesk } from "./map-desk";
import { coordinatePlace, parseCoordinateQuery } from "./navigation";

describe("map desk", () => {
  it("reads a coordinate and keeps unconnected feeds unconnected", () => {
    expect(parseCoordinateQuery("5.60371, -0.18700")).toEqual({ lat: 5.60371, lng: -0.187 });
    expect(parseCoordinateQuery("Kotoka")).toBeNull();
    expect(coordinatePlace({ lat: 5.6, lng: -0.2 }).name).toBe("Coordinates");
    const desk = mapDesk();
    const state = (name: string) => desk.find((item) => item.name === name)?.state;
    expect(state("Coordinates")).toBe("available");
    expect(state("Driving, walking and cycling")).toBe("available");
    expect(state("Distance between two taps")).toBe("available");
    expect(state("Live traffic, incidents and closures")).toBe("not_connected");
    expect(state("Street-level imagery")).toBe("not_connected");
    expect(state("Satellite, terrain and elevation")).toBe("not_connected");
    expect(state("Star ratings") ?? state("Reviews, photos and Local Guides")).toBe("not_connected");
    expect(state("Ask Maps or Gemini")).toBe("not_connected");
    expect(state("Live tracking of other people")).toBe("not_connected");
    const available = desk.filter((item) => item.state === "available").map((item) => item.detail).join(" ");
    expect(available.toLowerCase()).not.toMatch(/live traffic|star rating|street view|gemini|satellite/);
  });
});
