import type { Language } from "@/domain/drive-prefs";

const CODES: Record<Language, string[]> = {
  en: ["en-GH", "en-GB", "en"],
  tw: ["ak", "tw", "en-GH", "en"],
  gaa: ["gaa", "en-GH", "en"],
  ee: ["ee", "en-GH", "en"],
  ha: ["ha", "en-GH", "en"],
};

export const SPEAKING_VOICES = [
  { id: "ama", name: "Ama", detail: "Warm. Answers and a quiet warning.", rate: 0.9, pitch: 1.08, hint: "female" },
  { id: "kofi", name: "Kofi", detail: "Clear. Instructions and directions.", rate: 0.98, pitch: 0.86, hint: "male" },
  { id: "abena", name: "Abena", detail: "Bright. A lighter answer.", rate: 1.02, pitch: 1.16, hint: "female" },
  { id: "kojo", name: "Kojo", detail: "Direct. Short warnings.", rate: 0.94, pitch: 0.78, hint: "male" },
  { id: "esi", name: "Esi", detail: "Calm. Directions while you drive.", rate: 0.86, pitch: 1, hint: "female" },
] as const;

export type SpeakingVoiceId = (typeof SPEAKING_VOICES)[number]["id"];

const KEY = "nokware-speaking-voice";
const FEMALE = /female|woman|samantha|victoria|zira|susan|karen|moira|fiona|tessa|serena|kathy/i;
const MALE = /male|man\b|daniel|alex|david|rishi|fred|gordon|arthur|george/i;

export function speakingVoice(): SpeakingVoiceId {
  if (typeof window === "undefined") return "ama";
  const saved = window.localStorage.getItem(KEY);
  return SPEAKING_VOICES.some((voice) => voice.id === saved) ? (saved as SpeakingVoiceId) : "ama";
}

export function saveSpeakingVoice(id: SpeakingVoiceId) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, id);
}

function chooseDeviceVoice(hint: "female" | "male", lang: Language): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const wanted = CODES[lang];
  const pool = voices.filter((voice) => wanted.some((code) => voice.lang.toLowerCase().startsWith(code.toLowerCase())));
  const list = pool.length ? pool : voices;
  return list.find((voice) => (hint === "female" ? FEMALE : MALE).test(voice.name)) ?? list[0];
}

export function speak(text: string, lang: Language = "en", personaId?: SpeakingVoiceId) {
  if (typeof window === "undefined" || !text.trim() || !("speechSynthesis" in window)) return;
  const run = () => {
    window.speechSynthesis.cancel();
    const persona = SPEAKING_VOICES.find((voice) => voice.id === (personaId ?? speakingVoice())) ?? SPEAKING_VOICES[0];
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = persona.rate;
    utterance.pitch = persona.pitch;
    const match = chooseDeviceVoice(persona.hint, lang);
    utterance.lang = match?.lang ?? "en-GH";
    if (match) utterance.voice = match;
    window.speechSynthesis.speak(utterance);
  };
  if (window.speechSynthesis.getVoices().length) run();
  else {
    const onVoices = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
      run();
    };
    window.speechSynthesis.addEventListener("voiceschanged", onVoices);
    window.speechSynthesis.getVoices();
  }
}
