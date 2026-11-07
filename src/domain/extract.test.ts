import { describe, expect, it } from "vitest";
import { acceptReading, decideReading, needsAnotherPass, repairOcrLine, sealReading, settleReadings } from "./extract";

const WHEN = new Date("2026-01-15T12:00:00Z");
const LATER = new Date("2026-11-07T12:00:00Z");

const POOR = [
  "REPUBL1C 0F GHANA",
  "|||| page 1 of 1 ||||",
  "lnsurance Certif1cate",
  "P0licy No: EN-20481",
  "Veh1cle No: GR l234-2l",
  "Name of insured: Ama Mensah",
  "Exp1ry: l2/O3/2O26",
  "This policy is subject to the terms and conditions printed overleaf which the insured has read and agreed including exclusions limitations and warranties that are not repeated here because they are long and irrelevant to the date.",
  "Scan the qr code on the portal",
].join("\n");

describe("document extraction", () => {
  it("repairs a faint photo and drops the lines that are not the document", () => {
    const result = settleReadings([{ text: POOR, label: "Scaled photo" }], "image", WHEN);
    expect(repairOcrLine("Exp1ry: l2/O3/2O26")).toBe("Expiry: 12/03/2026");
    expect(repairOcrLine("lnsurance Certif1cate")).toBe("insurance Certificate");
    expect(result.suggestedKind).toBe("insurance");
    expect(result.suggestedExpiry).toBe("2026-03-12");
    expect(result.fields.find((field) => field.key === "plate")?.value).toBe("GR 1234-21");
    expect(result.fields.find((field) => field.key === "policy")?.value).toBe("EN-20481");
    expect(result.fields.find((field) => field.key === "holder")?.value).toBe("Ama Mensah");
    expect(result.kept.join(" ")).not.toMatch(/terms and conditions/i);
    expect(result.kept.join(" ")).not.toMatch(/qr code/i);
    expect(result.dropped).toBeGreaterThan(0);
    expect(result.confidence).toBe("high");
    expect(result.decision).toBe("accepted");
    expect(result.note).toBe("Accepted.");
    expect(result.note).not.toMatch(/DVLA|contrast|keeper|scaled|set aside|official/i);
    expect(settleReadings([{ text: POOR, label: "Scaled photo" }], "image", LATER).decision).toBe("refused");
    expect(settleReadings([{ text: POOR, label: "Scaled photo" }], "image", LATER).reasons.join(" ")).toMatch(/expiry date has passed/i);
  });

  it("keeps an agreed reading and refuses two expiry dates that do not match", () => {
    const shared = "Insurance\nPolicy EN-100\nName of insured: Ama Mensah\nVehicle GR 1234-21\n";
    const agreed = settleReadings(
      [
        { text: `${shared}Expiry 12/03/2026`, label: "Scaled photo" },
        { text: `${POOR}\n@@@@`, label: "Contrast" },
      ],
      "image",
      WHEN,
    );
    expect(agreed.suggestedExpiry).toBe("2026-03-12");
    expect(agreed.decision).toBe("refused");
    expect(agreed.reasons.join(" ")).toMatch(/policy number on the file was not consistent/i);
    const same = settleReadings(
      [
        { text: `${shared}Expiry 12/03/2026`, label: "First" },
        { text: `${shared}Expiry 12/03/2026`, label: "Second" },
      ],
      "text",
      WHEN,
    );
    expect(same.decision).toBe("accepted");
    expect(needsAnotherPass(same, { minPasses: 2 })).toBe(false);

    const split = settleReadings(
      [
        { text: `${shared}Expiry 12/03/2026`, label: "Scaled photo" },
        { text: `${shared}Expiry 12/08/2026`, label: "Contrast" },
      ],
      "image",
    );
    expect(split.suggestedExpiry).toBeNull();
    expect(split.disagreements.join(" ")).toMatch(/12 March 2026/);
    expect(split.disagreements.join(" ")).toMatch(/12 August 2026/);
    expect(split.confidence).not.toBe("high");
    expect(split.fields.find((field) => field.key === "plate")?.value).toBe("GR 1234-21");
    expect(split.decision).toBe("refused");
    expect(split.reasons.join(" ")).toMatch(/not consistent/i);
  });

  it("calculates an expiry only from a period printed on the file", () => {
    const result = settleReadings([{
      text: "Comprehensive insurance\nPolicy EN-19\nVehicle GR 1234-20\nValid for 12 months from 1 June 2025",
      label: "Text layer",
    }], "pdf", WHEN);
    const expiry = result.fields.find((field) => field.key === "expires");
    expect(expiry?.value).toBe("2026-06-01");
    expect(expiry?.derived).toBe(true);
    expect(result.decision).toBe("refused");
    expect(result.reasons.join(" ")).toMatch(/name is not on the document/i);
  });

  it("does not turn a loose date or an irrelevant note into a document", () => {
    const loose = settleReadings([{ text: "12/03/2026", label: "Paste" }], "text", WHEN);
    expect(loose.suggestedExpiry).toBeNull();
    expect(loose.kept.join(" ")).toMatch(/12\/03\/2026/);
    expect(loose.missing).toContain("Expiry");
    expect(loose.decision).toBe("refused");

    const noise = settleReadings([{ text: "The weather in Accra was hot and the trotro was full.", label: "Paste" }], "text");
    expect(noise.confidence).toBe("none");
    expect(noise.fields).toHaveLength(0);
    expect(noise.dropped).toBeGreaterThan(0);
    expect(noise.suggestedKind).toBeNull();
    expect(noise.decision).toBe("refused");
    expect(noise.reasons).toEqual(["Nothing on this file could be accepted."]);
  });

  it("reads the saved lines again and drops a date that was not in them", () => {
    const stored = acceptReading({
      kept: ["Insurance expiry 12/03/2026", "Policy EN-100"],
      fields: [{ label: "Expiry", value: "2099-01-01", derived: false }],
    });
    expect(stored?.fields.find((field) => field.label === "Expiry")?.value).toBe("2026-03-12");
    expect(stored?.fields.some((field) => field.value === "2099-01-01")).toBe(false);
    expect(acceptReading({ kept: ["The weather was hot"], fields: [] }, WHEN)).toBeNull();
  });

  it("accepts a complete document and refuses a date that is not on it", () => {
    const text = "Roadworthiness certificate\nVehicle GR 1234-21\nExpiry 12 March 2028\nIssued 1 June 2026";
    const result = settleReadings([{ text, label: "Paste" }], "text", LATER);
    expect(result.decision).toBe("accepted");
    const stored = acceptReading({ kept: result.kept, fields: [{ label: "Expiry", value: "2099-01-01", derived: false }] }, LATER);
    expect(stored?.decision).toBe("accepted");
    const moved = stored ? sealReading(stored, { expiresOn: "2029-01-01" }) : null;
    expect(moved?.decision).toBe("refused");
    expect(moved?.reasons.join(" ")).toMatch(/does not match the date on the document/i);
  });

  it("refuses an issue date after the expiry and a plate that is not a Ghana plate", () => {
    const reversed = settleReadings([{
      text: "Roadworthiness\nVehicle GR 1234-21\nIssued 1 June 2029\nExpiry 12 March 2028",
      label: "Paste",
    }], "text", LATER);
    expect(reversed.decision).toBe("refused");
    expect(reversed.reasons.join(" ")).toMatch(/issue date is after the expiry date/i);

    const badPlate = decideReading({
      fields: [
        { key: "kind", label: "Document", value: "Registration", evidence: "Registration", derived: false },
        { key: "plate", label: "Plate", value: "GR1234", evidence: "Plate GR1234", derived: false },
      ],
      suggestedKind: "registration",
      disagreements: [],
      confidence: "partial",
      kept: ["Registration", "Plate GR1234"],
    }, LATER);
    expect(badPlate.decision).toBe("refused");
    expect(badPlate.reasons.join(" ")).toMatch(/not a Ghana plate/i);
  });
});
