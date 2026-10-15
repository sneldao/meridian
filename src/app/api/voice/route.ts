import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// One voice per crew member — stock ElevenLabs voices, env-overridable
// (ELEVENLABS_VOICE_ANALYST=... etc).
const VOICES: Record<string, string> = {
  analyst: "EXAVITQu4vr4xnSDxMaL", // Mara — Bella
  researcher: "TxGEqnHWrfWFTfGW9XjX", // Jun — Josh
  planner: "VR6AewLTigWG4xSOukaG", // Otto — Arnold
  evaluator: "AZnzlk1XvdvUeBnXmlld", // Iris — Domi
  negotiator: "pNInz6obpgDQGcFmaJgB", // Rex — Adam
};

const MAX_CHARS = 600;

export async function POST(req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return new NextResponse(null, { status: 204 });

  let body: { agent?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text ?? "").trim().slice(0, MAX_CHARS);
  if (!text) return new NextResponse(null, { status: 204 });

  const agent = body.agent ?? "";
  const voice =
    process.env[`ELEVENLABS_VOICE_${agent.toUpperCase()}`] ??
    VOICES[agent] ??
    VOICES.evaluator;
  const model = process.env.ELEVENLABS_MODEL ?? "eleven_flash_v2_5";

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: model }),
    },
  );
  if (!res.ok || !res.body) return new NextResponse(null, { status: 502 });

  return new NextResponse(res.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
