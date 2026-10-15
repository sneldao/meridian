import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ enabled: Boolean(process.env.ELEVENLABS_API_KEY) });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ElevenLabs not configured" }, { status: 503 });
  }

  let text = "";
  try {
    const body = (await req.json()) as { text?: string };
    text = (body.text ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvBq8ikWAM";
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