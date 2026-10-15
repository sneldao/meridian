import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// One voice per crew member (ElevenLabs premade voices, available on every
// account). The old default (21m00Tcm4TlvBq8ikWAM, "Rachel") is not in the
// current premade library and 404s. Override any of them via env:
// ELEVENLABS_VOICE_ID (default / handoff) or ELEVENLABS_VOICE_<AGENT>.
const CREW_VOICES: Record<string, string> = {
  analyst: "Xb7hH8MSUJpSbSDYk0k2", // Mara — Alice, clear
  researcher: "JBFqnCBsd6RMkjVDRZzb", // Jun — George, storyteller
  planner: "IKne3meq5aSn9XLyUdCD", // Otto — Charlie, energetic
  evaluator: "XrExE9yKIg1WjnnlVkGX", // Iris — Matilda, professional
  negotiator: "CwhRBWXzGAHq8TQ4Fs17", // Rex — Roger, laid-back
};
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah — the morning handoff

function voiceFor(agent?: string): string {
  const key = agent?.toUpperCase();
  return (
    (key && process.env[`ELEVENLABS_VOICE_${key}`]) ||
    (agent && CREW_VOICES[agent]) ||
    process.env.ELEVENLABS_VOICE_ID ||
    DEFAULT_VOICE
  );
}

export async function GET() {
  return NextResponse.json({ enabled: Boolean(process.env.ELEVENLABS_API_KEY) });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ElevenLabs not configured" }, { status: 503 });
  }

  let text = "";
  let agent: string | undefined;
  try {
    const body = (await req.json()) as { text?: string; agent?: string };
    text = (body.text ?? "").trim();
    agent = body.agent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const voiceId = voiceFor(agent);
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: text.slice(0, 1800),
      model_id: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
      voice_settings: {
        stability: Number(process.env.ELEVENLABS_STABILITY ?? 0.45),
        similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY_BOOST ?? 0.75),
      },
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: `ElevenLabs request failed (${res.status})` }, { status: res.status });
  }
  const audio = await res.arrayBuffer();
  return new Response(audio, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}