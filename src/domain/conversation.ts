import { formatDay } from "./dates";
import type { Reading, Tone } from "./hearing";
import type { AIAnswer, Workspace } from "./types";

const FORBIDDEN =
  /you will win|guaranteed|live traffic|official record|camera is (?:ahead|at)|payment (?:is|was) complete|connected to the (?:police|dvla|traffitech)/i;

const LEADS: Record<Tone, string> = {
  jovial: "Ha, I follow you.",
  urgent: "",
  frustrated: "I get why that is frustrating.",
  formal: "Here is what is saved.",
  plain: "",
};

export function reviewAnswer(answer: AIAnswer, allowed: string): { ok: boolean; answer: AIAnswer } {
  const body = answer.sections.map((section) => section.body).join("\n");
  if (FORBIDDEN.test(body)) return { ok: false, answer };
  const numbers = body.match(/\d+(?:\.\d+)?/g) ?? [];
  if (numbers.some((value) => !allowed.includes(value))) return { ok: false, answer };
  return { ok: true, answer };
}

export function present(answer: AIAnswer, reading: Reading, withLead = true): AIAnswer {
  const lead = withLead ? LEADS[reading.tone] : "";
  const sections = answer.sections.map((section, index) =>
    index === 0 && lead ? { ...section, body: `${lead} ${section.body}` } : section,
  );
  if (reading.changed && reading.intent !== "unclear") {
    sections.splice(1, 0, {
      kind: "USER_PROVIDED",
      heading: "What I heard",
      body: `I read that as “${reading.text}”. ${reading.note}`.trim(),
    });
  }
  const next: AIAnswer = {
    ...answer,
    confidenceNote: "Checked against the records on this account before it was shown. Not a prediction and not legal advice.",
    sections,
  };
  const allowed = [answer.sections.map((section) => section.body).join(" "), reading.text, lead].join(" ");
  return reviewAnswer(next, allowed).ok ? next : answer;
}

export function clarify(reading: Reading): AIAnswer {
  const ask = "Ask about a document, a notice, your score, a trip, or whether you are ready to drive.";
  const body =
    reading.tone === "jovial"
      ? `Ha, I am with you, and I did not catch a question I can answer from your records. ${ask}`
      : reading.tone === "frustrated"
        ? `I get why that is frustrating. I did not catch a question I can answer from your records. ${ask}`
        : reading.tone === "urgent"
          ? `Say it once more, in a few words. ${ask}`
          : `I did not catch a question I can answer from your records. ${ask}`;
  return {
    title: "Say that once more",
    confidenceNote: "Checked before it was shown. Nothing was guessed from an unclear phrase.",
    refused: false,
    provider: "local",
    sections: [
      { kind: "FACT", heading: "Not enough to answer", body },
      {
        kind: "USER_PROVIDED",
        heading: "What I heard",
        body: reading.text ? `I heard “${reading.text}”. ${reading.note}`.trim() : reading.note,
      },
    ],
  };
}

export function socialAnswer(reading: Reading): AIAnswer | null {
  const tone = reading.tone;
  if (reading.intent === "greet") {
    const body =
      tone === "jovial"
        ? "Ha, I am here. Ask me about a document, a notice, your score, or the next thing to do. I only use what you saved."
        : "Hello. Ask me about a document, a notice, your score, or whether you are ready to drive. I only use what you saved.";
    return { title: "Hello", confidenceNote: "", refused: false, provider: "local", sections: [{ kind: "FACT", heading: "Here", body }] };
  }
  if (reading.intent === "thanks") {
    return {
      title: "Anytime",
      confidenceNote: "",
      refused: false,
      provider: "local",
      sections: [{ kind: "FACT", heading: "Still here", body: "The records stay on this account. Ask when you want another one." }],
    };
  }
  if (reading.intent === "smalltalk") {
    const body =
      tone === "jovial"
        ? "Ha, I am here, and I only know the records on this account. What do you want to check?"
        : "I am here, and I only know the records on this account. What do you want to check?";
    return { title: "I am here", confidenceNote: "", refused: false, provider: "local", sections: [{ kind: "FACT", heading: "Records only", body }] };
  }
  if (reading.intent === "help") {
    return {
      title: "What I can do",
      confidenceNote: "",
      refused: false,
      provider: "local",
      sections: [{
        kind: "FACT",
        heading: "From your records",
        body: "I can talk through the documents you saved, a notice you imported, the calculated score, a recorded trip, and whether those records say you are ready to drive. A file is accepted or not accepted on its own. I keep the notes you typed.",
      }],
    };
  }
  return null;
}

export function lawAnswer(): AIAnswer {
  return {
    title: "The posted sign",
    confidenceNote: "",
    refused: false,
    provider: "local",
    sections: [
      {
        kind: "FACT",
        heading: "Educational, not an official reading",
        body: "The posted sign controls. Where no sign says otherwise, public texts of the Road Traffic Regulations, 2012 (L.I. 2180) describe these maximums: 30 km/h where people gather, 50 km/h on a road in an urban or built-up area, 90 km/h outside an urban or built-up area other than a motorway, and 100 km/h on a motorway. The regulation text says the Road Authority may indicate otherwise. A posted sign is the limit for that stretch. This is not an official feed for the road you are on.",
      },
      {
        kind: "RECOMMENDATION",
        heading: "Where to read the rest",
        body: "The Ghana speed limits page in Nokware carries the rest of that public text. Select the sign you can see.",
      },
    ],
  };
}

export function documentAnswer(ws: Workspace): AIAnswer {
  if (!ws.documents.length) {
    return {
      title: "Documents",
      confidenceNote: "",
      refused: false,
      provider: "local",
      sections: [{ kind: "FACT", heading: "Nothing saved", body: "No documents are saved on this account yet. Add the date printed on the paper, or upload the file so the lines that look like the document can be read." }],
    };
  }
  const lines = [...ws.documents]
    .sort((a, b) => (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999))
    .map((doc) => {
      const when = doc.expiresOn ? formatDay(doc.expiresOn) : "no date";
      const days = doc.daysRemaining == null ? "" : ` ${doc.daysRemaining} days.`;
      const note = doc.note.trim() ? ` Note you saved: ${doc.note.trim()}.` : "";
      const read = (doc.reading?.fields ?? [])
        .filter((field) => !doc.note.includes(field.value) && !doc.note.includes(field.label))
        .map((field) => `${field.label} ${field.value}`)
        .join(", ");
      const readSentence = read ? ` ${read}.` : "";
      return `${doc.label}: ${doc.status}, ${when}.${days}${note}${readSentence} ${doc.verificationLabel}.`;
    });
  const nearest = [...ws.documents].filter((doc) => doc.daysRemaining != null).sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0))[0];
  const next = !nearest
    ? "Add the date printed on the paper. Nokware does not file the renewal."
    : nearest.daysRemaining != null && nearest.daysRemaining < 0
      ? "Renew the expired document, then update the date you saved. Nokware does not file the renewal."
      : "Plan the nearest date. Nokware does not file the renewal.";
  return {
    title: "Documents",
    confidenceNote: "",
    refused: false,
    provider: "local",
    sections: [
      { kind: "FACT", heading: "Saved on this account", body: lines.join(" ") },
      { kind: "USER_PROVIDED", heading: "What is remembered", body: "Accepted means the details on that file agree. Not accepted means they do not." },
      { kind: "RECOMMENDATION", heading: "Next", body: next },
    ],
  };
}
