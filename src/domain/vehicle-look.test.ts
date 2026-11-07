import { describe, expect, it } from "vitest";
import { cleanVehicleName, parseVehicleStored, resolveVehicle, vehicleMarkup } from "./vehicle-look";

describe("vehicle on the map", () => {
  it("draws a trotro for a trotro driver, and a car when that trip is not the trotro", () => {
    const usual = resolveVehicle({ mode: "driving", role: "trotro", stored: null });
    expect(usual.body).toBe("trotro");
    expect(usual.paint).toBe("#f3e2b8");
    expect(usual.note).toMatch(/Switch to a car/);
    expect(usual.note).not.toMatch(/live/i);

    const trip = resolveVehicle({
      mode: "driving",
      role: "trotro",
      stored: { trip: "saloon", paint: "blue", stripe: "red", name: "Auntie Grace" },
    });
    expect(trip.body).toBe("saloon");
    expect(trip.paint).toBe("#1e4d8c");
    expect(trip.name).toBe("");
  });

  it("uses a person or a bicycle when the route is not a drive", () => {
    expect(resolveVehicle({ mode: "walking", role: "trotro", stored: { trip: "trotro", paint: null, stripe: "red", name: "" } }).body).toBe("walk");
    expect(resolveVehicle({ mode: "cycling", role: "private", stored: null }).body).toBe("bicycle");
  });

  it("keeps an okada on the driving route and says the motorcycle route is not connected", () => {
    const mark = resolveVehicle({ mode: "driving", role: "private", stored: { trip: "okada", paint: null, stripe: "none", name: "" } });
    expect(mark.body).toBe("okada");
    expect(mark.note).toMatch(/not connected/);
  });

  it("drops markup from a trotro name and still paints the name that remains", () => {
    expect(cleanVehicleName("<script>alert")).toBe("scriptalert");
    const stored = parseVehicleStored(JSON.stringify({ trip: "trotro", paint: "nope", stripe: "blue", name: "Auntie <Grace>" }));
    expect(stored?.paint).toBeNull();
    expect(stored?.name).toBe("Auntie Grace");
    const mark = resolveVehicle({ mode: "driving", role: "private", stored });
    const svg = vehicleMarkup(mark, false);
    expect(svg).toContain("Auntie Grace");
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<Grace");
  });
});
