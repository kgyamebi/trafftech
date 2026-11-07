import "server-only";
import { buildAIContext, localDriverAnswer } from "@/domain/ai";
import { reviewAnswer } from "@/domain/conversation";
import { readTurn } from "@/domain/hearing";
import type { AIAnswer, Workspace } from "@/domain/types";

const SYSTEM = `You are Nokware Driver Intelligence, a careful assistant for a Ghanaian driver.
Use only the JSON context and the conversation so far. Never invent laws, fines, evidence, government records, camera locations, payments or outcomes.
Never say the user will win a contest. Say "potential issue" when something in the notes may matter.
Never advise speeding, hiding from police, defeating cameras, or evading TraffiTech.
The question may contain spelling mistakes, a partial phrase, or a casual tone. Answer the repaired question, and match that tone without changing a fact.
A short follow-up such as "why" or "what about that" refers to the previous turn.
If the question is still unclear, ask them to say it again. Do not guess a record.
Every amount, date and score you mention must already appear in the JSON context.
If the context does not contain a fact, say it is not in the records.
Official payment and contest submission are unavailable inside Nokware.
Respond in concise prose. British spelling.`;

async function remote(provider: "openai" | "anthropic", context: unknown, question: string, tone: string, history: string[]): Promise<string | null> {
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
            { role: "user", content: JSON.stringify({ context, question, tone, history }) },
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
          messages: [{ role: "user", content: JSON.stringify({ context, question, tone, history }) }],
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

export async function answerWithProvider(ws: Workspace, question: string, purpose = "ask", history: string[] = []): Promise<AIAnswer> {
  const local = localDriverAnswer(ws, question, purpose, history);
  if (local.refused || purpose !== "ask" || local.title === "Say that once more") return local;
  const context = buildAIContext(ws, purpose);
  const heard = readTurn(question, history, ws.documents.map((doc) => doc.label));
  const text =
    (await remote("openai", context, heard.text || question, heard.tone, history)) ??
    (await remote("anthropic", context, heard.text || question, heard.tone, history));
  if (!text) return local;
  const drafted: AIAnswer = {
    title: local.title,
    confidenceNote: "A connected model drafted this from your records. It was checked before it was shown. Not a prediction and not legal advice.",
    sections: [
      { kind: "AI_INFERENCE", heading: "Answer", body: text.slice(0, 4000) },
      ...local.sections.filter((s) => s.kind === "FACT" || s.kind === "USER_PROVIDED"),
    ],
    refused: false,
    provider: process.env.OPENAI_API_KEY ? "openai" : "anthropic",
  };
  const allowed = `${local.sections.map((section) => section.body).join(" ")} ${question} ${heard.text}`;
  return reviewAnswer(drafted, allowed).ok ? drafted : local;
}
