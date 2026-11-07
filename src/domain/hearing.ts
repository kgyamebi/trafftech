import { isEvasionRequest } from "./inbox";

export type Tone = "jovial" | "urgent" | "frustrated" | "formal" | "plain";

export type Intent =
  | "evasion"
  | "greet"
  | "thanks"
  | "help"
  | "smalltalk"
  | "score"
  | "documents"
  | "violation"
  | "trip"
  | "ready"
  | "summary"
  | "next"
  | "law"
  | "vehicle"
  | "follow"
  | "unclear";

export interface Hearing {
  original: string;
  text: string;
  changed: boolean;
  confidence: "clear" | "repaired" | "unclear";
  note: string;
}

export interface Reading {
  tone: Tone;
  intent: Intent;
  text: string;
  changed: boolean;
  confidence: "clear" | "repaired" | "unclear";
  note: string;
}

const LEXICON = [
  "insurance",
  "roadworthiness",
  "registration",
  "licence",
  "score",
  "renewal",
  "renew",
  "expired",
  "expiring",
  "expiry",
  "violation",
  "notice",
  "ticket",
  "fine",
  "trip",
  "ready",
  "vehicle",
  "document",
  "documents",
  "speed",
  "limit",
  "hello",
  "thanks",
  "summary",
  "month",
  "driving",
  "explain",
  "change",
  "papers",
  "camera",
  "police",
  "avoid",
  "evade",
  "traffitech",
  "warning",
  "direction",
  "answer",
  "ownership",
];

const ORDINARY = new Set([
  "about", "again", "also", "back", "been", "best", "come", "could", "does", "done", "down",
  "each", "else", "even", "ever", "from", "give", "good", "have", "here", "just", "keep",
  "know", "last", "left", "like", "long", "look", "made", "make", "many", "more", "most",
  "much", "need", "next", "only", "over", "please", "same", "scare", "should", "some",
  "soon", "still", "store", "such", "take", "tell", "than", "that", "them", "then",
  "there", "these", "they", "this", "those", "time", "today", "very", "want", "well",
  "were", "what", "when", "where", "which", "while", "with", "would", "your",
]);

const PHRASES: [RegExp, string][] = [
  [/\broad\s*worth(?:iness|y|i)?\b/g, "roadworthiness"],
  [/\broad\s*worthy\b/g, "roadworthiness"],
  [/\bsticker\b/g, "roadworthiness"],
  [/\bin\s*surance\b/g, "insurance"],
  [/\b(?:policy|cover note|my cover)\b/g, "insurance"],
  [/\b(?:drivers?|driving)\s+licen[cs]e\b/g, "licence"],
  [/\blicen[cs]e\b/g, "licence"],
  [/\b(?:log\s*book|logbook)\b/g, "registration"],
  [/\bpapers\b/g, "documents"],
  [/\btraff+i?tech\b/g, "traffitech"],
  [/\bgood to go\b/g, "ready to drive"],
  [/\bhow you dey\b/g, "how are you"],
  [/\bwhat'?s up\b/g, "hello"],
  [/\bwassup\b/g, "hello"],
  [/\bwhats\b/g, "what is"],
  [/\bim\b/g, "i am"],
  [/\bdont\b/g, "do not"],
  [/\bmedaase\b/g, "thanks"],
  [/\bna gode\b/g, "thanks"],
  [/\bakpe\b/g, "thanks"],
];

function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[a.length][b.length];
}

function correctToken(token: string): string {
  const word = token.toLowerCase();
  if (word.length < 4 || LEXICON.includes(word) || ORDINARY.has(word)) return word;
  if (/^expir/.test(word)) return "expiry";
  let best = "";
  let bestDistance = 3;
  for (const known of LEXICON) {
    if (known[0] !== word[0]) continue;
    const limit = word.length >= 8 || known.length >= 8 ? 2 : 1;
    if (Math.abs(known.length - word.length) > limit) continue;
    const distance = editDistance(word, known);
    if (distance < bestDistance && distance <= limit) {
      best = known;
      bestDistance = distance;
    } else if (distance === bestDistance) {
      best = "";
    }
  }
  if (best) return best;
  const prefixed = LEXICON.filter((known) => known.startsWith(word) && known.length - word.length <= 5);
  if (word.length >= 4 && prefixed.length === 1) return prefixed[0];
  return word;
}

export function repairTranscript(raw: string): Hearing {
  const original = raw.replace(/\s+/g, " ").trim();
  let text = original.toLowerCase().replace(/['’]/g, "");
  for (const [pattern, replacement] of PHRASES) text = text.replace(pattern, replacement);
  text = text.replace(/\b(\w+)(?:\s+\1\b)+/g, "$1");
  const tokens = text
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(correctToken);
  text = tokens.join(" ");
  const changed = text !== original.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const known = new Set([...LEXICON, ...ORDINARY, "i", "me", "my", "you", "a", "an", "the", "is", "am", "are", "to", "of", "for", "and", "or", "do", "did", "can", "not", "it", "on", "in", "at", "nah", "yeah", "yes", "no", "ok", "hey", "hi", "yo", "chale", "bro", "why", "though", "because", "how", "when", "where"]);
  const content = tokens.filter((token) => !["a", "an", "the", "i", "me", "my", "you", "is", "am", "to", "of", "and", "or"].includes(token));
  const unknown = content.filter((token) => !known.has(token)).length;
  const unclear = content.length === 0 || (content.length > 0 && unknown / content.length > 0.55 && !LEXICON.some((word) => text.includes(word)));
  return {
    original,
    text,
    changed,
    confidence: unclear ? "unclear" : changed ? "repaired" : "clear",
    note: unclear
      ? "This did not settle into a question."
      : changed
        ? "Spelling was straightened so the question could be read."
        : "",
  };
}

export function readTone(original: string): Tone {
  const text = original.toLowerCase();
  if (/\b(asap|urgent|emergency|hurry|right now|now now)\b/.test(text)) return "urgent";
  if (/\b(annoying|useless|stupid|rubbish|waste|hate|frustrated|nonsense)\b/.test(text) || /why (?:won't|cant|can't)/.test(text)) return "frustrated";
  if (/\b(haha|hahaha|lol|lmao|lwk|hehe|chale|charley|bro|massa|eii|herh|paa)\b/.test(text) || /[😂🤣]/.test(original) || /!{2,}/.test(original)) return "jovial";
  if (/\b(kindly|please advise|dear|sir|madam)\b/.test(text)) return "formal";
  return "plain";
}

function intentOf(text: string): Intent {
  const cleaned = text.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "unclear";
  if (isEvasionRequest(cleaned)) return "evasion";
  if (/^(thanks|thank you)( very much)?$/.test(cleaned)) return "thanks";
  if (/^(hey|hi|hello|yo|good morning|good afternoon|good evening|chale)$/.test(cleaned)) return "greet";
  if (/^(how are you|how you dey|i am fine)$/.test(cleaned)) return "smalltalk";
  if (/\bscore\b|\bpoints\b/.test(cleaned) || /why .{0,32}(fall|drop|down|low)/.test(cleaned)) return "score";
  if (/\b(violation|fine|ticket|notice|summons)\b/.test(cleaned)) return "violation";
  if (/\btrip\b|\bjourney\b|\blast drive\b/.test(cleaned)) return "trip";
  if (/\bready\b/.test(cleaned)) return "ready";
  if (/\b(renew\w*|expir\w*|insurance|roadworthiness|registration|licence|documents?|ownership)\b/.test(cleaned)) return "documents";
  if (/\bsummar|\bthis month\b|\bmy driving\b/.test(cleaned)) return "summary";
  if (/\bwhat next\b|\bwhat is next\b|\bwhat should i\b|\bwhat do i do\b|\bnext thing\b/.test(cleaned)) return "next";
  if (/\bspeed limit\b|\bhow fast\b|\bgeneral bands\b/.test(cleaned)) return "law";
  if (/\b(vehicle|plate|my car)\b/.test(cleaned)) return "vehicle";
  if (/what can you|who are you|how do you work|help me/.test(cleaned)) return "help";
  if (/^(and|what about|how about|that one|the first one|the other one|tell me more|go on|more|why|why though|and then|same for|what of)\b/.test(cleaned)) return "follow";
  return "unclear";
}

function settle(intent: Intent, earlier: Intent[]): Intent {
  if (intent !== "follow") return intent;
  const previous = [...earlier].reverse().find((item) => !["follow", "unclear", "greet", "thanks", "smalltalk", "help"].includes(item));
  return previous ?? "unclear";
}

function intentsInOrder(questions: string[], labels: string[]): Intent[] {
  const out: Intent[] = [];
  for (const question of questions) {
    const heard = repairTranscript(question);
    let intent = intentOf(heard.text);
    if (isEvasionRequest(question) || isEvasionRequest(heard.text)) intent = "evasion";
    if (intent === "unclear" && labels.some((label) => label.length > 3 && heard.text.includes(label.toLowerCase()))) intent = "documents";
    out.push(settle(intent, out));
  }
  return out;
}

export function readTurn(original: string, earlier: string[] = [], labels: string[] = []): Reading {
  const heard = repairTranscript(original);
  const tone = readTone(original);
  let intent = intentOf(heard.text);
  if (isEvasionRequest(original) || isEvasionRequest(heard.text)) intent = "evasion";
  if (intent === "unclear" && labels.some((label) => label.length > 3 && heard.text.includes(label.toLowerCase()))) intent = "documents";
  intent = settle(intent, intentsInOrder(earlier, labels));
  const confidence = intent === "unclear" ? "unclear" : heard.changed ? "repaired" : "clear";
  return {
    tone,
    intent,
    text: heard.text,
    changed: heard.changed,
    confidence,
    note: heard.note,
  };
}
