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
  /** Marks from the day before the selected day — null when there's nothing
   *  to report. */
  yesterday?: { done: number; total: number } | null;
  /** The selected day's planned bedtime, already formatted. */
  bedAt?: string | null;
  onDone?: () => void;
  compact?: boolean;
}

export function VoiceControls({ nextStep, todaySteps, yesterday, bedAt, onDone, compact }: VoiceControlsProps) {
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
  // "Listen to today" is a 20-second briefing: yesterday's marks, today's next
  // three steps, tonight's bedtime, then the one step that's actually next.
  const briefingParts: string[] = [];
  if (yesterday && yesterday.total > 0) {
    briefingParts.push(`Yesterday you did ${yesterday.done} of ${yesterday.total} steps.`);
  }
  const remaining = todaySteps.slice(0, 3);
  if (remaining.length) {
    briefingParts.push(`Today: ${remaining.map((st) => `${st.title} at ${st.time}`).join(", ")}.`);
  }
  if (bedAt) briefingParts.push(`Tonight, bed at ${bedAt}.`);
  if (nextStep) briefingParts.push(`Next up: ${nextStep.title} at ${nextStep.time}.`);
  const briefing = briefingParts.join(" ");
  const todayText = briefing || null;

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
      speak(briefing);
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

  const btnCls = compact
    ? "inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--m-border)] text-[var(--m-text)] hover:border-[#D96B43]"
    : "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[var(--m-border)] px-3.5 py-1.5 text-xs font-bold text-[var(--m-text)] hover:border-[#D96B43]";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {canSpeak && briefing && (
          <button
            type="button"
            className={btnCls}
            aria-label={speaking ? "Stop" : "Listen to today"}
            title={speaking ? "Stop" : "Listen to today"}
            onClick={() => {
              if (speaking) {
                stopSpeaking();
                setSpeaking(false);
              } else {
                speak(briefing);
              }
            }}
          >
            {speaking ? <Square size={compact ? 14 : 12} /> : <Volume2 size={compact ? 16 : 12} />}
            {!compact && (speaking ? "Stop" : "Listen to today")}
          </button>
        )}
        {canListen && (
          <button
            type="button"
            className={btnCls}
            aria-label={listening ? "Listening…" : "Ask"}
            title={listening ? "Listening…" : "Ask"}
            onClick={ask}
            disabled={listening}
          >
            <Mic size={compact ? 16 : 12} />
            {!compact && (listening ? "Listening…" : "Ask")}
          </button>
        )}
      </div>
      <span aria-live="polite" className="text-[11px] text-[var(--m-muted)]">
        {micError
          ? "Couldn't hear you — tap Ask to try again."
          : heard
            ? `Heard: “${heard}”`
            : ""}
      </span>
    </div>
  );
}
