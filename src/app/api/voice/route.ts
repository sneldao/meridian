import { NextRequest, NextResponse } from "next/server";
import {
  chatModel,
  dialogueModel,
  karaokeEnabled,
  outputFormat,
  streamHeaders,
  tagFor,
  voiceEnabled,
  voiceFor,
  voiceSeed,
  voiceSettings,
} from "@/lib/voice/config";
import { dialogueStream, speakStream, VoiceProviderError } from "@/lib/voice/elevenlabs";
import { lookupVoice, storeVoice, voiceCacheBackend, voiceCacheKey } from "@/lib/voice/cache";
import { cleanForTts } from "@/lib/voice/clean";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Audio tags ([calm, clinical] …) are honoured by v3/v4 only; flash ignores
// them and, worse, they shift alignment indices on the timestamps path.
const tagCapable = (m: string) => /eleven_v[34]/.test(m);

// Dialogue shares the PCM output format so the client schedules it chunk by
// chunk — the handoff starts speaking at first audio instead of after the
// whole exchange has synthesized.

// Stream the upstream body to the client while accumulating a copy for the
// cache. A cancelled stream writes nothing — partial audio must never be a hit.
function tee(upstream: ReadableStream<Uint8Array>, onDone: (buf: Uint8Array) => void): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const chunks: Uint8Array[] = [];
  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      const { done, value } = await reader.read();
      if (done) {
        ctrl.close();
        if (chunks.length) {
          const total = chunks.reduce((n, c) => n + c.length, 0);
          const buf = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) {
            buf.set(c, off);
            off += c.length;
          }
          onDone(buf);
        }
        return;
      }
      chunks.push(value);
      ctrl.enqueue(value);
    },
    async cancel() {
      try {
        await reader.cancel();
      } catch {
        /* upstream may already be closed */
      }
    },
  });
}

function fail(err: unknown) {
  if (err instanceof VoiceProviderError) {
    // Local validation codes pass through; upstream failures read as 502 so a
    // provider 401 never masquerades as our own auth problem.
    const status = ["not_configured", "missing_text", "missing_inputs", "too_many_voices", "text_too_long"].includes(err.code)
      ? err.status
      : 502;
    return NextResponse.json({ error: err.message, code: err.code, fatal: err.fatal }, { status });
  }
  console.error("[voice] unexpected", err);
  return NextResponse.json({ error: "voice synthesis failed" }, { status: 500 });
}

export async function GET() {
  // 204 when unset — absence is a state, not a payload (docs/reference/providers.md).
  if (!voiceEnabled()) return new Response(null, { status: 204 });
  return NextResponse.json({
    enabled: true,
    models: { crew: chatModel(), dialogue: dialogueModel() },
    cache: voiceCacheBackend(),
  });
}

interface Line {
  agent: string;
  text: string;
}

export async function POST(req: NextRequest) {
  let body: { text?: string; agent?: string; timestamps?: boolean; prev?: string; lines?: Line[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    if (Array.isArray(body.lines)) return await dialogue(body.lines);
    return await single(body);
  } catch (err) {
    return fail(err);
  }
}

// Multi-voice exchange in one ElevenLabs call — the crew actually converses.
async function dialogue(lines: Line[]) {
  const usable = lines.filter((l) => l && typeof l.agent === "string" && l.text?.trim());
  if (!usable.length) return NextResponse.json({ error: "lines must be {agent, text} pairs" }, { status: 400 });

  const model = dialogueModel();
  const format = outputFormat();
  const inputs = usable.map((l) => {
    const tag = tagCapable(model) ? tagFor(l.agent) : "";
    return { voiceId: voiceFor(l.agent), text: (tag ? `${tag} ` : "") + cleanForTts(l.text).clean };
  });
  const settings = voiceSettings();
  const key = voiceCacheKey({
    kind: "dialogue",
    voice: inputs.map((i) => i.voiceId).sort().join(","),
    model,
    text: inputs.map((i) => i.text).join("|"),
    format,
    align: false,
    seed: voiceSeed(),
    stability: settings.stability,
    similarity: settings.similarity_boost,
  });
  const hit = await lookupVoice(key);
  if (hit) {
    return new Response(new Uint8Array(hit.bytes), {
      headers: { ...streamHeaders(format), "X-Voice-Cache": `hit:${hit.source}` },
    });
  }

  const res = await dialogueStream({ inputs, model, outputFormat: format });
  const contentType = format.startsWith("pcm") ? "audio/pcm" : "audio/mpeg";
  return new Response(tee(res.body!, (buf) => void storeVoice(key, buf, contentType)), {
    headers: { ...streamHeaders(format), "X-Voice-Cache": "miss" },
  });
}

// Single-voice utterance. Default: raw PCM stream for Web Audio scheduling.
// timestamps:true → with-timestamps NDJSON (audio_base64 + char alignment) for
// karaoke sync.
async function single(body: { text?: string; agent?: string; timestamps?: boolean; prev?: string }) {
  const raw = body.text ?? "";
  if (!raw.trim()) return NextResponse.json({ error: "Missing text" }, { status: 400 });

  const model = chatModel();
  const { clean } = cleanForTts(raw);
  if (!clean) return NextResponse.json({ error: "Missing text" }, { status: 400 });
  const tag = tagCapable(model) && !clean.startsWith("[") ? tagFor(body.agent) : "";
  const text = tag ? `${tag} ${clean}` : clean;
  const alignOff = tag ? tag.length + 1 : 0;

  const voice = voiceFor(body.agent);
  const align = Boolean(body.timestamps) && karaokeEnabled();
  const format = outputFormat();
  const settings = voiceSettings();
  const key = voiceCacheKey({
    kind: "tts",
    voice,
    model,
    text,
    format,
    align,
    seed: voiceSeed(),
    stability: settings.stability,
    similarity: settings.similarity_boost,
  });
  const hit = await lookupVoice(key);
  const extra = {
    "X-Voice-Cache": hit ? `hit:${hit.source}` : "miss",
    ...(alignOff ? { "X-Voice-Align-Offset": String(alignOff) } : {}),
  };
  if (hit) {
    return new Response(new Uint8Array(hit.bytes), {
      headers: { ...streamHeaders(format), ...(align ? { "Content-Type": "application/x-ndjson" } : {}), ...extra },
    });
  }

  const res = await speakStream({
    text,
    voiceId: voice,
    model,
    outputFormat: format,
    align,
    previousText: body.prev ? cleanForTts(body.prev).clean : undefined,
  });
  const contentType = align ? "application/x-ndjson" : undefined;
  return new Response(tee(res.body!, (buf) => void storeVoice(key, buf, contentType ?? "audio/pcm")), {
    headers: { ...streamHeaders(format), ...(contentType ? { "Content-Type": contentType } : {}), ...extra },
  });
}
