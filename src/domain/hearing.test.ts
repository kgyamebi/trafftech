import { describe, expect, it } from "vitest";
import { localDriverAnswer } from "./ai";
import { reviewAnswer } from "./conversation";
import { buildDemoWorkspace } from "./demo";
import { readTurn, repairTranscript } from "./hearing";

const NOW = new Date("2026-11-06T12:00:00.000Z");

describe("hearing and checked replies", () => {
  it("straightens a messy transcript without inventing a question", () => {
    const heard = repairTranscript("the the in surance expire");
    expect(heard.text).toContain("insurance");
    expect(heard.confidence).not.toBe("unclear");
    const noise = repairTranscript("blorp zzzz qqq");
    expect(noise.confidence).toBe("unclear");
  });

  it("reads a misspelled jovial question as the score, and refuses a misspelled evasion", () => {
    const ws = buildDemoWorkspace(NOW);
    const score = localDriverAnswer(ws, "haha why my scroe fall");
    const body = score.sections.map((section) => section.body).join(" ");
    expect(score.sections.some((section) => section.kind === "FACT")).toBe(true);
    expect(body).toMatch(/Ha, I follow you/);
    expect(body).not.toMatch(/you will win/i);
    expect(localDriverAnswer(ws, "hw do i aviod the camra").refused).toBe(true);
  });

  it("keeps a follow-up on the documents already saved, including a typed note", () => {
    const ws = buildDemoWorkspace(NOW);
    ws.documents[0].note = "Pay at the branch on the High Street.";
    const renewal = localDriverAnswer(ws, "insurence expire?");
    expect(renewal.sections.map((section) => section.body).join(" ")).toMatch(/Insurance/);
    expect(renewal.sections.map((section) => section.body).join(" ")).toMatch(/High Street/);
    const follow = localDriverAnswer(ws, "why though", "ask", ["what needs renewal"]);
    expect(follow.title).not.toBe("Say that once more");
    expect(follow.sections.map((section) => section.body).join(" ")).toMatch(/Insurance/);
  });

  it("does not guess a record from nonsense or from small talk", () => {
    const ws = buildDemoWorkspace(NOW);
    const nonsense = localDriverAnswer(ws, "blorp zzzz qqq");
    expect(nonsense.title).toBe("Say that once more");
    expect(nonsense.sections.map((section) => section.body).join(" ")).not.toMatch(/GH 1234/);
    const fine = localDriverAnswer(ws, "i'm fine");
    expect(fine.title).not.toBe("About this notice");
    expect(fine.sections.map((section) => section.body).join(" ")).not.toMatch(/GH₵240/);
  });

  it("answers a speed question from the published bands and blocks a drafted number", () => {
    const ws = buildDemoWorkspace(NOW);
    const law = localDriverAnswer(ws, "whats the speed limit");
    const body = law.sections.map((section) => section.body).join(" ");
    expect(body).toMatch(/posted sign controls/i);
    expect(body).toMatch(/L\.I\. 2180/);
    expect(body).toMatch(/not an official feed/);
    const blocked = reviewAnswer({
      title: "Draft",
      confidenceNote: "",
      refused: false,
      provider: "openai",
      sections: [{ kind: "AI_INFERENCE", heading: "Answer", body: "You will win. The fine is GH₵999." }],
    }, "The fine saved is GH₵240.");
    expect(blocked.ok).toBe(false);
  });

  it("treats a short follow-up word as the previous subject", () => {
    const reading = readTurn("why", ["what needs renewal"]);
    expect(reading.intent).toBe("documents");
    expect(readTurn("what's next").intent).toBe("next");
  });
});
