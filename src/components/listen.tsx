"use client";

import type { Language } from "@/domain/drive-prefs";
import { speak } from "./speak";

export function Listen({ text, label = "Listen", lang = "en" }: { text: string; label?: string; lang?: Language }) {
  return (
    <button type="button" className="btn min-h-14" onClick={() => speak(text, lang)}>
      {label}
    </button>
  );
}
