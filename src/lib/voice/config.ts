import { parseOutputFormat } from "./format";

// Voice-layer configuration. Server-only: it reads process.env, so client code
// must take its settings from the response headers of /api/voice instead.
//
// Every model choice here is constrained by one fact: audio tags ([whispers],
// [excited], free-form delivery directions) are honoured only by the v3/v4
// models. eleven_flash_v2_5 is the faster and cheaper option (~75ms vs ~100ms
// median inference) but silently ignores every tag, which would make five
// crew members sound like one flat narrator. The crew talks on eleven_v4_turbo
// — the documented real-time pick among the expressive models — and Flash is an
// explicit downgrade switch via ELEVENLABS_MODEL_ID, not the default.
//
// Voice ids are ElevenLabs premade voices, present on every account. The old
// default (21m00Tcm4TlvBq8ikWAM, "Rachel") is not in the current premade
// library and 404s.

const CREW_VOICES: Record<string, string> = {
  analyst: "Xb7hH8MSUJpSbSDYk0k2", // Mara — Alice, clear
  researcher: "JBFqnCBsd6RMkjVDRZzb", // Jun — George, storyteller
  planner: "IKne3meq5aSn9XLyUdCD", // Otto — Charlie, energetic
  evaluator: "XrExE9yKIg1WjnnlVkGX", // Iris — Matilda, professional
  negotiator: "CwhRBWXzGAHq8TQ4Fs17", // Rex — Roger, laid-back
};
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah — the morning handoff

// Delivery direction per persona, matched to the crew's system prompts in
// src/agents/crew.ts. Ambiguous tags can be read as sound effects, so these
// stay explicitly about the voice.
const CREW_TAGS: Record<string, string> = {
  analyst: "[calm, clinical]",
  researcher: "[warm, storytelling]",
  planner: "[brisk, upbeat]",
  evaluator: "[dry, measured]",
  negotiator: "[laid-back, low]",
};
const DEFAULT_TAG = "[warm, measured]";

/** Documented per-request character limits. Unknown models take the floor. */
const CHAR_LIMITS: Record<string, number> = {
  eleven_v4: 10_000,
  eleven_v3: 5_000,
  eleven_flash_v2_5: 40_000,
  eleven_flash_v2: 30_000,
  eleven_multilingual_v2: 10_000,
};

export function voiceFor(agent?: string): string {
  const key = agent?.toUpperCase();
  return (
    (key && process.env[`ELEVENLABS_VOICE_${key}`]) ||
    (agent && CREW_VOICES[agent]) ||
    process.env.ELEVENLABS_VOICE_ID ||
    DEFAULT_VOICE
  );
}

/**
 * The audio tag spoken ahead of an utterance. Tags are added only on the way to
 * ElevenLabs — the crew feed and any cached transcript never see them.
 */
export function tagFor(agent?: string): string {
  if (process.env.MERIDIAN_VOICE_TAGS === "off") return "";
  const key = agent?.toUpperCase();
  return (
    (key && process.env[`ELEVENLABS_TAG_${key}`]) ||
    (agent && CREW_TAGS[agent]) ||
    process.env.ELEVENLABS_TAG ||
    DEFAULT_TAG
  );
}

export function chatModel(): string {
  return process.env.ELEVENLABS_MODEL_ID ?? "eleven_v4_turbo";
}

/** Text to Dialogue runs on v3; v4 is not accepted by every dialogue route. */
export function dialogueModel(): string {
  return process.env.ELEVENLABS_DIALOGUE_MODEL_ID ?? "eleven_v3";
}

export function outputFormat(): string {
  return process.env.ELEVENLABS_OUTPUT_FORMAT ?? "pcm_22050";
}

/**
 * Karaoke alignment costs a base64-wrapped NDJSON stream instead of raw audio.
 * Off, /api/voice pipes bare PCM and the feed stays unhighlighted.
 */
export function karaokeEnabled(): boolean {
  return process.env.MERIDIAN_VOICE_KARAOKE !== "off";
}

export function voiceSeed(): number {
  const raw = Number(process.env.MERIDIAN_VOICE_SEED ?? 42);
  if (!Number.isInteger(raw)) return 42;
  return Math.min(4294967295, Math.max(0, raw));
}

export function voiceSettings() {
  // Eleven v4 exposes only Stability and Similarity; style/speed are ignored
  // by the model, so they are not sent.
  return {
    stability: Number(process.env.ELEVENLABS_STABILITY ?? 0.45),
    similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY_BOOST ?? 0.75),
  };
}

export function charLimit(model: string): number {
  return CHAR_LIMITS[model] ?? 5_000;
}

export function voiceEnabled(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

/** What the browser needs in order to feed the stream into a audio pipeline. */
export function streamHeaders(format = outputFormat()) {
  const parsed = parseOutputFormat(format);
  return {
    "Content-Type": parsed.codec === "pcm" ? "audio/pcm" : "audio/mpeg",
    "X-Voice-Codec": parsed.codec,
    "X-Voice-Sample-Rate": String(parsed.sampleRate),
    "X-Voice-Format": format,
    "Cache-Control": "no-store",
  };
}
