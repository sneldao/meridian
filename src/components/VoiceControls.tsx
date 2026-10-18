"use client";

import { useRef, useState } from "react";
import { Mic, Square, Volume2 } from "lucide-react";
import { isVoiceAvailable, speakOnce, stopAll } from "@/lib/voice/engine";

// Speak through the voice engine when the deployment has one, else the
// browser's own speech synthesis. Either way, only ever on tap.
function say(text: string, cbs?: { onStart?: () => void; onEnd?: () => void }) {
  if (isVoiceAvailable()) {
    speakOnce(text, "handoff", cbs, true);
    return;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.onstart = () => cbs?.onStart?.();
    u.onend = () => cbs?.onEnd?.();
    u.onerror = () => cbs?.onEnd?.();
    window.speechSynthesis.speak(u);
    return;
  }
  cbs?.onEnd?.();
}

function stopSpeaking() {
  stopAll();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

type SR = typeof window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: { [i: number]: { [i: number]: { transcript: string } } } }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface VoiceControlsProps {
  nextStep: { time: string; city: string; title: string; actionSummary: string } | null;
  todaySteps: { time: string; title: string }[];
  onDone?: () => void;
}

export function VoiceControls({ nextStep, todaySteps, onDone }: VoiceControlsProps) {
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [micError, setMicError] = useState(false);
  const heardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canSpeak] = useState(
    () => typeof window !== "undefined" && (isVoiceAvailable() || "speechSynthesis" in window),
  );
  const [canListen] = useState(() => {
    if (typeof window === "undefined") return false;
    const w = window as SR;
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  });

  const speak = (text: string) => {
    stopSpeaking();
    say(text, { onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) });
  };

  const nextStepText = nextStep
    ? `${nextStep.time} ${nextStep.city}: ${nextStep.title}. ${nextStep.actionSummary}`
    : null;
  const todayText = todaySteps.length
    ? todaySteps.map((s) => `${s.time} ${s.title}`).join(". ")
    : null;

  const handleTranscript = (raw: string) => {
    const t = raw.toLowerCase();
    setHeard(raw);
    if (heardTimer.current) clearTimeout(heardTimer.current);
    heardTimer.current = setTimeout(() => setHeard(null), 4000);
    if (t.includes("stop") || t.includes("quiet")) {
      stopSpeaking();
      return;
    }
    if (t.includes("done")) {
      onDone?.();
      speak("Marked done.");
      return;
    }
    if (t.includes("next") && nextStepText) {
      speak(nextStepText);
      return;
    }
    if ((t.includes("today") || t.includes("plan")) && todayText) {
      speak(todayText);
      return;
    }
    speak("Try saying: what's next, or read today's plan.");
  };

  const ask = () => {
    const w = window as SR;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language;
    rec.interimResults = false;
    setMicError(false);
    setListening(true);
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      if (transcript) handleTranscript(transcript);
    };
    rec.onerror = () => {
      setMicError(true);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
    } catch {
      setListening(false);
      setMicError(true);
    }
  };

  if (!canListen && !canSpeak) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {canSpeak && nextStepText && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#e3d5c3] px-3 py-1.5 text-xs font-bold text-[#5b4d41] hover:border-[#D96B43]"
            onClick={() => {
              if (speaking) {
                stopSpeaking();
                setSpeaking(false);
              } else {
                speak(nextStepText);
              }
            }}
          >
            {speaking ? <Square size={12} /> : <Volume2 size={12} />}
            {speaking ? "Stop" : "Listen"}
          </button>
        )}
        {canListen && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#e3d5c3] px-3 py-1.5 text-xs font-bold text-[#5b4d41] hover:border-[#D96B43]"
            onClick={ask}
            disabled={listening}
          >
            <Mic size={12} />
            {listening ? "Listening…" : "Ask"}
          </button>
        )}
      </div>
      <span aria-live="polite" className="text-[11px] text-[#7a6a5c]">
        {micError
          ? "Couldn't hear you — tap Ask to try again."
          : heard
            ? `Heard: “${heard}”`
            : ""}
      </span>
    </div>
  );
}
