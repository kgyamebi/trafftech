import { describe, expect, it } from "vitest";
import { alertSpeech, briefScript, greetingLine, languageNote, plainAlert, slowDownSpeech, speedBoard, violationScript, workWindow } from "./companion";
import { exchange, hearSpeed, wayPhrase } from "./languages";

describe("gps speed board", () => {
  it("labels a phone fix as GPS speed and never as the vehicle speedometer", () => {
    const board = speedBoard({ source: "gps", speedKph: 48, accuracyM: 12, limitKph: 50, limitOrigin: "user_declared" });
    expect(board.caption).toBe("GPS speed");
    expect(board.speed).toBe(48);
    expect(board.limitLabel).toBe("Limit you set");
    expect(board.status).toBe("SAFE");
    expect(board.line).toMatch(/Not the vehicle speedometer/);
    expect(board.line.toLowerCase()).not.toMatch(/official/);
  });

  it("does not invent a zero when the phone has no speed", () => {
    const missing = speedBoard({ source: "none", speedKph: null, accuracyM: null, limitKph: null, limitOrigin: "unavailable" });
    expect(missing.speed).toBeNull();
    expect(missing.status).toBe("UNKNOWN");
    expect(missing.line).toBe("GPS speed unavailable");
    const weak = speedBoard({ source: "gps", speedKph: 48, accuracyM: 80, limitKph: 50, limitOrigin: "user_declared" });
    expect(weak.line).toBe("GPS accuracy reduced");
    expect(weak.speed).toBe(48);
  });

  it("keeps a demonstration out of the GPS label", () => {
    const board = speedBoard({ source: "demo", speedKph: 42, accuracyM: null, limitKph: 50, limitOrigin: "demo_script" });
    expect(board.caption).toBe("Demo speed");
    expect(board.line).toMatch(/Not your GPS/);
  });

  it("speaks a slow-down only for a real GPS fix over a limit the driver set", () => {
    const over = speedBoard({ source: "gps", speedKph: 68, accuracyM: 10, limitKph: 50, limitOrigin: "user_declared" });
    expect(over.status).toBe("ABOVE LIMIT");
    expect(slowDownSpeech(over)).toMatch(/limit you set/);
    expect(slowDownSpeech(over)?.toLowerCase()).not.toMatch(/school|traffic ahead/);
    const demo = speedBoard({ source: "demo", speedKph: 68, accuracyM: null, limitKph: 50, limitOrigin: "demo_script" });
    expect(slowDownSpeech(demo)).toBeNull();
  });
});

describe("spoken records", () => {
  it("does not say ready when a document date is still ahead", () => {
    const lines = briefScript({
      greeting: "Good evening, Ama",
      papersClear: false,
      openNotices: 0,
      focusTitle: "Roadworthiness expires in 27 days",
    });
    expect(lines.join(" ")).toMatch(/Good evening/);
    expect(lines.join(" ")).toMatch(/27 days/);
    expect(lines.join(" ")).not.toMatch(/ready to drive/i);
    expect(plainAlert("Roadworthiness expires in 27 days")).toBe("Vehicle document expires soon.");
    expect(alertSpeech("Roadworthiness expires in 27 days")).toBe("A saved vehicle document expires in 27 days.");
  });

  it("does not invent a speed or a deadline that was not saved", () => {
    const lines = violationScript({
      title: "Speed violation",
      status: "action_required",
      recordedSpeedKph: null,
      applicableLimitKph: null,
      daysRemaining: null,
      deadlineConfirmed: false,
      amountGhs: null,
    });
    expect(lines.join(" ")).not.toMatch(/\d/);
    expect(lines.join(" ").toLowerCase()).not.toMatch(/school/);
  });

  it("reads a paid notice as entered here, not as a government receipt", () => {
    const lines = violationScript({
      title: "Speed violation",
      status: "paid_user_reported",
      recordedSpeedKph: 112,
      applicableLimitKph: 100,
      daysRemaining: -3,
      deadlineConfirmed: true,
      amountGhs: 240,
    });
    expect(lines.join(" ")).toMatch(/112/);
    expect(lines.join(" ")).toMatch(/100/);
    expect(lines.join(" ")).toMatch(/not a government receipt/);
    expect(lines.join(" ")).not.toMatch(/due/);
  });

  it("uses published greetings and only published driving words", () => {
    expect(greetingLine("tw", 20).text).toBe("Maadwo.");
    expect(greetingLine("gaa", 8).text).toBe("Ojekoo.");
    expect(greetingLine("gaa", 14).text).toBe("Minaokoo.");
    expect(greetingLine("gaa", 20).text).toBe("Oshwiee.");
    expect(greetingLine("ee", 8)).toEqual({ text: "Ŋdi.", fallback: false });
    expect(greetingLine("ee", 14).text).toBe("Ŋdɔ.");
    expect(greetingLine("ee", 17).text).toBe("Woale.");
    expect(greetingLine("ee", 20).text).toBe("Fiẽ.");
    expect(greetingLine("ha", 8).text).toBe("Ina kwana?");
    expect(greetingLine("ha", 14).text).toBe("Ina wuni?");
    expect(greetingLine("ha", 20).text).toBe("Barka da yamma.");
    expect(exchange("tw", 8)).toBe("Maakye. Ɛte sɛn? Me ho yɛ.");
    expect(exchange("gaa", 14)).toBe("Minaokoo. Te oyɔɔ tɛŋŋ? Mi yɛ ojogbaŋŋ.");
    expect(exchange("ee", 8)).toBe("Ŋdi. Ɛfoa? Me fo.");
    expect(exchange("ha", 8)).toBe("Ina kwana? Lafiya lau.");
    expect(exchange("en", 8)).toBeNull();
    const over = speedBoard({ source: "gps", speedKph: 68, accuracyM: 10, limitKph: 50, limitOrigin: "user_declared" });
    expect(slowDownSpeech(over, "tw")).toBe("Brɛ ase. 68. 50.");
    expect(slowDownSpeech(over, "ha")).toBe("Rage gudu. 68. 50.");
    expect(slowDownSpeech(over, "ee")).toBe("Etsɔ akpa. Blewu. 68. 50.");
    expect(slowDownSpeech(over, "gaa")).toMatch(/limit you set/);
    expect(hearSpeed("tw", 8, 0, 50, "SAFE")).toBe("Maakye. Ɛte sɛn? Me ho yɛ. Ɛyɛ. 0. 50. Medaase.");
    expect(hearSpeed("gaa", 8, 68, 50, "ABOVE LIMIT")).toMatch(/Reduce speed/);
    expect(hearSpeed("gaa", 8, 68, 50, "ABOVE LIMIT")).toMatch(/Ojekoo/);
    expect(wayPhrase("tw", "Turn left onto Ring Road")).toBe("Fa benkum. Ring Road.");
    expect(wayPhrase("tw", "Turn right")).toBe("Fa nifa.");
    expect(wayPhrase("tw", "Continue on Liberation Road")).toBe("Kɔ tee. Liberation Road.");
    expect(wayPhrase("ee", "Turn left")).toBe("Yi miame.");
    expect(wayPhrase("ee", "Turn right onto Ho Road")).toBe("Yi ɖusime. Ho Road.");
    expect(wayPhrase("gaa", "Turn left")).toBeNull();
    expect(wayPhrase("ha", "Turn right")).toBeNull();
    expect(languageNote("tw")).toMatch(/Ɛte sɛn/);
    expect(languageNote("gaa")).toMatch(/English/);
    expect(languageNote("ee")).toMatch(/Ɛfoa/);
    expect(languageNote("ha")).toMatch(/Lafiya lau/);
    expect(languageNote("en")).toBeNull();
  });
});

describe("costs", () => {
  it("does not turn an empty book into a zero-cedi week", () => {
    const summary = workWindow([], [], new Date("2026-11-06T18:00:00.000Z"));
    expect(summary.weekOut).toBeNull();
    expect(summary.monthIn).toBeNull();
    expect(summary.trend).toMatch(/Not enough/);
  });
});
