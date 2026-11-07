import "server-only";
import { buildAIContext, localDriverAnswer } from "@/domain/ai";
import type { AIAnswer, Workspace } from "@/domain/types";

const SYSTEM = `You are Nokware Driver Intelligence, a careful assistant for a Ghanaian driver.
Use only the JSON context. Never invent laws, fines, evidence, government records, camera locations or outcomes.
Never say the user will win a contest. Say "potential issue" when something in the notes may matter.
Never advise speeding, hiding from police, defeating cameras, or evading TraffiTech.
Label reasoning as FACT, USER PROVIDED, AI INFERENCE or RECOMMENDATION.
If the context does not contain a fact, say it is not in the records.
Official payment and contest submission are unavailable inside Nokware.
Respond in concise prose. British spelling.`;

async function remote(provider: "openai" | "anthropic", context: unknown, question: string): Promise<string | null> {
  try {
    if (provider === "openai" && process.env.OPENAI_API_KEY) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: JSON.stringify({ context, question }) },
          ],
        }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return json.choices?.[0]?.message?.content ?? null;
    }
    if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
          max_tokens: 700,
          system: SYSTEM,
          messages: [{ role: "user", content: JSON.stringify({ context, question }) }],
        }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { content?: { text?: string }[] };
      return json.content?.map((c) => c.text).join("\n") ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

export async function answerWithProvider(ws: Workspace, question: string, purpose = "ask"): Promise<AIAnswer> {
  const local = localDriverAnswer(ws, question, purpose);
  if (local.refused) return local;
  const context = buildAIContext(ws, purpose);
  const text =
    (await remote("openai", context, question)) ?? (await remote("anthropic", context, question));
  if (!text) return local;
  return {
    title: local.title,
    confidenceNote: "Generated with a connected model from your Nokware context. Still not a prediction, and not legal advice.",
    sections: [
      { kind: "AI_INFERENCE", heading: "Model response", body: text.slice(0, 4000) },
      ...local.sections.filter((s) => s.kind === "FACT"),
    ],
    refused: false,
    provider: process.env.OPENAI_API_KEY ? "openai" : "anthropic",
  };
}
