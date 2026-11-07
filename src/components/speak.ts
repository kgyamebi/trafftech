import type { Language } from "@/domain/drive-prefs";

const CODES: Record<Language, string[]> = {
  en: ["en-GH", "en-GB", "en"],
  tw: ["ak", "tw", "en-GH", "en"],
  gaa: ["gaa", "en-GH", "en"],
  ee: ["ee", "en-GH", "en"],
  ha: ["ha", "en-GH", "en"],
};

export function speak(text: string, lang: Language = "en") {
  if (typeof window === "undefined" || !text.trim() || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.92;
  const voices = window.speechSynthesis.getVoices();
  const wanted = CODES[lang];
  const match = voices.find((voice) => wanted.some((code) => voice.lang.toLowerCase().startsWith(code.toLowerCase())));
  utterance.lang = match?.lang ?? "en-GH";
  if (match) utterance.voice = match;
  window.speechSynthesis.speak(utterance);
}
