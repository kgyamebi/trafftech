import type { Language } from "./drive-prefs";
import type { ProtectionStatus } from "./protection";

/**
 * Conversations a Ghanaian actually exchanges, checked across published lists.
 * Twi: Wikivoyage Twi phrasebook, Omniglot, LearnAkan, All About Accra (Asante school spelling).
 * Ga: Wikivoyage Ga phrasebook, SpeakGa, All About Accra. No driving slow-down in those lists.
 * Eʋegbe: Peace Corps Ewe course (2010), Omniglot, Wikivoyage. Blewu and etsɔ akpa are the course's "slowly" and "too fast".
 * Hausa: Wikivoyage, Omniglot, NKENNE, Lingalot. Ina kwana / Ina wuni / Lafiya lau is the living exchange. Rage gudu is the dictionary slow-down.
 * Numbers stay digits. The posted-sign sentence stays English.
 */
export interface DriveVoice {
  safe: string;
  approaching: string | null;
  above: string | null;
  unknown: string | null;
  /** Null when no published slow-down exists. */
  slow: string | null;
  thanks: string;
  again: string;
  hello: (hour: number) => string[];
  left: string | null;
  right: string | null;
  straight: string | null;
  note: string | null;
}

const ENGLISH: DriveVoice = {
  safe: "SAFE",
  approaching: "APPROACHING LIMIT",
  above: "ABOVE LIMIT",
  unknown: "UNKNOWN",
  slow: "Reduce speed.",
  thanks: "",
  again: "",
  hello: (hour) => [hour < 12 ? "Good morning." : hour < 17 ? "Good afternoon." : "Good evening."],
  left: null,
  right: null,
  straight: null,
  note: null,
};

export function driveVoice(lang: Language): DriveVoice {
  if (lang === "tw") {
    return {
      safe: "Ɛyɛ",
      approaching: null,
      above: "Brɛ ase",
      unknown: "Mennim",
      slow: "Brɛ ase.",
      thanks: "Medaase.",
      again: "Yɛbɛhyia bio.",
      hello: (hour) => [hour < 12 ? "Maakye." : hour < 17 ? "Maaha." : "Maadwo.", "Ɛte sɛn?", "Me ho yɛ."],
      left: "Fa benkum.",
      right: "Fa nifa.",
      straight: "Kɔ tee.",
      note: "Twi opens the way people do: Maakye, Ɛte sɛn, Me ho yɛ, then Medaase. Brɛ ase means slow down. Fa benkum, fa nifa, kɔ tee are the turns. The posted sign line stays English.",
    };
  }
  if (lang === "ha") {
    return {
      safe: "Lafiya",
      approaching: null,
      above: "Rage gudu",
      unknown: "Ban sani ba",
      slow: "Rage gudu.",
      thanks: "Na gode.",
      again: "Sai an jima.",
      hello: (hour) => [hour < 12 ? "Ina kwana?" : hour < 17 ? "Ina wuni?" : "Barka da yamma.", "Lafiya lau."],
      left: null,
      right: null,
      straight: null,
      note: "Hausa opens with Ina kwana or Ina wuni, and the reply Lafiya lau, then Na gode. Rage gudu means slow down. The posted sign line stays English.",
    };
  }
  if (lang === "gaa") {
    return {
      ...ENGLISH,
      safe: "Ojogbaŋŋ",
      approaching: null,
      above: null,
      unknown: null,
      slow: null,
      thanks: "Oyiwaladɔŋŋ.",
      again: "Yaaba jogbaŋŋ.",
      hello: (hour) => [hour < 12 ? "Ojekoo." : hour < 17 ? "Minaokoo." : "Oshwiee.", "Te oyɔɔ tɛŋŋ?", "Mi yɛ ojogbaŋŋ."],
      note: "Ga opens with Ojekoo, Minaokoo, or Oshwiee, then Te oyɔɔ tɛŋŋ and Mi yɛ ojogbaŋŋ. Oyiwaladɔŋŋ is thank you. The slow-down stays English.",
    };
  }
  if (lang === "ee") {
    return {
      ...ENGLISH,
      safe: "Enyo",
      approaching: null,
      above: "Etsɔ akpa",
      unknown: "Nye me nya o",
      slow: "Blewu.",
      thanks: "Akpe.",
      again: "Mia dogo.",
      hello: (hour) => [hour < 12 ? "Ŋdi." : hour < 16 ? "Ŋdɔ." : hour < 18 ? "Woale." : "Fiẽ.", "Ɛfoa?", "Me fo."],
      left: "Yi miame.",
      right: "Yi ɖusime.",
      straight: null,
      note: "Eʋegbe opens with Ŋdi, Ŋdɔ, Woale, or Fiẽ, then Ɛfoa and Me fo. Etsɔ akpa, blewu means too fast, slowly. Yi miame and yi ɖusime are the turns. The posted sign line stays English.",
    };
  }
  return ENGLISH;
}

export function greet(lang: Language, hour: number): { text: string; fallback: boolean } {
  const [first] = driveVoice(lang).hello(hour);
  return { text: first ?? "Hello.", fallback: false };
}

/** The greeting people trade before any business: time of day, how are you, the reply. */
export function exchange(lang: Language, hour: number): string | null {
  if (lang === "en") return null;
  return driveVoice(lang).hello(hour).join(" ");
}

export function aboveSpeech(lang: Language, speed: number, limit: number): string {
  const voice = driveVoice(lang);
  if (!voice.slow || lang === "en") return `Reduce speed. GPS speed is ${speed}. The limit is ${limit}. The posted sign controls.`;
  if (lang === "ee") return `Etsɔ akpa. Blewu. ${speed}. ${limit}.`;
  return `${voice.slow} ${speed}. ${limit}.`;
}

export function hearSpeed(lang: Language, hour: number, speed: number, limit: number | null, status: ProtectionStatus): string {
  if (lang === "en") {
    const limitLine = limit == null ? "No limit set." : `The limit is ${limit}.`;
    return `GPS speed ${speed}. ${limitLine} ${status}.`;
  }
  const voice = driveVoice(lang);
  const digits = limit == null ? `${speed}.` : `${speed}. ${limit}.`;
  const hello = voice.hello(hour).join(" ");
  if (status === "ABOVE LIMIT" && voice.slow) {
    const shout = lang === "ee" ? `Etsɔ akpa. Blewu. ${digits}` : `${voice.slow} ${digits}`;
    return `${hello} ${shout} ${voice.thanks}`.trim();
  }
  if (status === "ABOVE LIMIT") {
    const limitLine = limit == null ? "No limit set." : `The limit is ${limit}.`;
    return `${hello} Reduce speed. GPS speed is ${speed}. ${limitLine} The posted sign controls. ${voice.thanks}`.trim();
  }
  const word = status === "SAFE" ? voice.safe : status === "UNKNOWN" ? voice.unknown : voice.approaching;
  return `${hello} ${word ?? status}. ${digits} ${voice.thanks}`.trim();
}

export function wayPhrase(lang: Language, text: string): string | null {
  if (lang === "en" || !text.trim()) return null;
  const voice = driveVoice(lang);
  const road = text.match(/\b(?:onto|on) (.+)$/)?.[1]?.trim() ?? "";
  const say = (line: string | null) => (line ? (road ? `${line} ${road}.` : line) : null);
  if (/^(Turn left|Keep left|Bear left|Exit left)\b/.test(text)) return say(voice.left);
  if (/^(Turn right|Keep right|Bear right|Exit right)\b/.test(text)) return say(voice.right);
  if (/^(Continue|Head)\b/.test(text)) return say(voice.straight);
  return null;
}
