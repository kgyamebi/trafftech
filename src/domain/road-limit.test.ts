import { describe, expect, it } from "vitest";
import { chooseRoadLimit, nearestMappedLimit, parseMaxspeed, rememberRoadLimit } from "./road-limit";

const here = { lat: 5.6037, lng: -0.187 };

describe("mapped road limits", () => {
  it.each([
    ["50", 50],
    ["50 km/h", 50],
    ["80kmh", 80],
    ["30 mph", 48],
    ["50;50", 50],
  ])("reads %s as %s km/h", (raw, kph) => {
    expect(parseMaxspeed(raw)).toBe(kph);
  });

  it.each(["signals", "none", "walk", "urban", "GH:urban", "50;80", "", null])("does not invent a limit from %s", (raw) => {
    expect(parseMaxspeed(raw)).toBeNull();
  });

  it("uses the closest tagged road and ignores a nearer road with no usable tag", () => {
    const metresEast = 0.00009;
    const match = nearestMappedLimit(here, [
      {
        id: 1,
        name: "Untagged closer",
        maxspeed: "signals",
        points: [
          { lat: 5.603, lng: -0.187 + metresEast / 4 },
          { lat: 5.604, lng: -0.187 + metresEast / 4 },
        ],
      },
      {
        id: 2,
        name: "Liberation Road",
        maxspeed: "50",
        points: [
          { lat: 5.603, lng: -0.187 + metresEast },
          { lat: 5.604, lng: -0.187 + metresEast },
        ],
      },
      {
        id: 3,
        name: "Far motorway",
        maxspeed: "100",
        points: [
          { lat: 5.603, lng: -0.187 + 0.002 },
          { lat: 5.604, lng: -0.187 + 0.002 },
        ],
      },
    ]);
    expect(match?.kph).toBe(50);
    expect(match?.road).toBe("Liberation Road");
    expect(match?.metres).toBeLessThan(35);
  });

  it("keeps a rider's limit on the road that had none, and lets a mapped tag win", () => {
    const saved = rememberRoadLimit({}, "Tsiranana Loop", 30);
    expect(chooseRoadLimit({ road: "tsiranana loop", mappedKph: null, saved })).toEqual({ kph: 30, source: "user_declared" });
    expect(chooseRoadLimit({ road: "Independence Avenue", mappedKph: null, saved })).toEqual({ kph: null, source: "unavailable" });
    expect(chooseRoadLimit({ road: "Tsiranana Loop", mappedKph: 50, saved })).toEqual({ kph: 50, source: "openstreetmap" });
    expect(rememberRoadLimit(saved, "  ", 40)).toEqual(saved);
  });

  it("returns nothing when the phone is not beside a tagged road", () => {
    expect(nearestMappedLimit(here, [])).toBeNull();
    expect(
      nearestMappedLimit(here, [
        {
          id: 4,
          name: "Distant",
          maxspeed: "90",
          points: [
            { lat: 5.61, lng: -0.187 },
            { lat: 5.612, lng: -0.187 },
          ],
        },
      ]),
    ).toBeNull();
  });
});
