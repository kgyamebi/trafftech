"use client";

import { useEffect, useState } from "react";
import { saveSpeakingVoice, speak, speakingVoice, SPEAKING_VOICES, type SpeakingVoiceId } from "./speak";

const SAMPLE = "This is Nokware. I will use this voice for warnings, directions and answers.";

export function VoiceChoice() {
  const [chosen, setChosen] = useState<SpeakingVoiceId>("ama");
  useEffect(() => {
    setChosen(speakingVoice());
  }, []);
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">Ama, Kofi, Abena, Kojo and Esi are speaking styles. The sound is a voice already on this phone. Nokware does not record an actor.</p>
      <div className="voice-grid">
        {SPEAKING_VOICES.map((voice) => (
          <button
            key={voice.id}
            type="button"
            className={chosen === voice.id ? "voice-card is-on" : "voice-card"}
            aria-pressed={chosen === voice.id}
            onClick={() => {
              saveSpeakingVoice(voice.id);
              setChosen(voice.id);
              speak(SAMPLE, "en", voice.id);
            }}
          >
            <span className="display text-2xl">{voice.name}</span>
            <span className="mt-1 block text-sm text-muted">{voice.detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
