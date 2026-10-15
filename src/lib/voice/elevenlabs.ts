import { charLimit, voiceSettings, voiceSeed } from "./config";

// ElevenLabs REST client for the streaming paths. Nothing here buffers: the
// upstream Response body is handed straight to the route, which taps it for the
// cache while piping it to the browser. Buffering on the server is what made the
// crew go silent for seconds after agent_end.

export class VoiceProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    /** Quota and rate limits will not improve by retrying this run. */
    readonly fatal: boolean,
  ) {
    super(message);
    this.name = "VoiceProviderError";
  }
}

const BASE = () => process.env.ELEVENLABS_BASE_URL ?? "https://api.elevenlabs.io";

function headers(): Record<string, string> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new VoiceProviderError("ElevenLabs not configured", 503, "not_configured", true);
  return { "xi-api-key": key, "Content-Type": "application/json" };
}

/**
 * ElevenLabs puts the useful part in `detail`, which is an object for transport
 * errors and a list for 422 validation. Without the code, every failure looks
 * like the same generic "request failed (400)" to the operator.
 */
async function toError(res: Response): Promise<VoiceProviderError> {
  let message = `ElevenLabs request failed (${res.status})`;
  let code = `http_${res.status}`;
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (Array.isArray(detail)) {
      code = String(detail[0]?.type ?? body?.status ?? code);
      message = detail.map((d) => d.msg).filter(Boolean).join("; ") || message;
    } else if (detail && typeof detail === "object") {
      code = String(detail.code ?? detail.type ?? code);
      message = String(detail.message ?? message);
    } else if (typeof detail === "string") {
      message = detail;
    } else if (typeof body?.message === "string") {
      message = body.message;
    }
  } catch {
    /* non-JSON error body — keep the status line */
  }
  const fatal =
    res.status === 401 || res.status === 402 || res.status === 403 || res.status === 404 ||
    code === "insufficient_credits" || code === "voice_not_found" || code === "model_not_found";
  return new VoiceProviderError(message, res.status, code, fatal);
}

export interface SpeakOptions {
  text: string;
  voiceId: string;
  model: string;
  outputFormat: string;
  align: boolean;
  previousText?: string;
  nextText?: string;
}

export async function speakStream(opts: SpeakOptions): Promise<Response> {
  if (!opts.text.trim()) throw new VoiceProviderError("Missing text", 400, "missing_text", false);
  const limit = charLimit(opts.model);
  if (opts.text.length > limit) {
    // Truncating silently would speak half a sentence and charge for it.
    throw new VoiceProviderError(
      `Text is ${opts.text.length} characters; ${opts.model} accepts ${limit}. Chunk it before synthesis.`,
      413,
      "text_too_long",
      false,
    );
  }
  const path = `/v1/text-to-speech/${opts.voiceId}/${opts.align ? "stream/with-timestamps" : "stream"}`;
  const query = new URLSearchParams({ output_format: opts.outputFormat });
  const res = await fetch(`${BASE()}${path}?${query}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      text: opts.text,
      model_id: opts.model,
      voice_settings: voiceSettings(),
      // Same seed, same take: replay demos sound identical and stay cache-hittable.
      seed: voiceSeed(),
      apply_text_normalization: "auto",
      ...(opts.previousText ? { previous_text: opts.previousText.slice(-200) } : {}),
      ...(opts.nextText ? { next_text: opts.nextText.slice(0, 200) } : {}),
    }),
  });
  if (!res.ok) throw await toError(res);
  if (!res.body) throw new VoiceProviderError("ElevenLabs returned no body", 502, "empty_response", false);
  return res;
}

export interface DialogueInput {
  voiceId: string;
  text: string;
}

/**
 * Text to Dialogue: one request, several voices, shared prosody, so the crew
 * audibly reacts to each other instead of reading past one another. The route
 * takes `inputs[]`, not a `dialogue[]`, and the transcript across all turns
 * should stay under ~2,000 characters or the stream can terminate early.
 */
export async function dialogueStream(opts: {
  inputs: DialogueInput[];
  model: string;
  outputFormat: string;
}): Promise<Response> {
  if (opts.inputs.length === 0) throw new VoiceProviderError("Missing dialogue inputs", 400, "missing_inputs", false);
  if (opts.inputs.length > 10) throw new VoiceProviderError("Text to Dialogue takes 10 voices at most", 400, "too_many_voices", false);
  const chars = opts.inputs.reduce((n, i) => n + i.text.length, 0);
  if (chars > 2000) {
    throw new VoiceProviderError(`Dialogue transcript is ${chars} characters; keep it under 2000.`, 413, "text_too_long", false);
  }
  const res = await fetch(
    `${BASE()}/v1/text-to-dialogue/stream?${new URLSearchParams({ output_format: opts.outputFormat })}`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model_id: opts.model,
        inputs: opts.inputs.map((i) => ({ voice_id: i.voiceId, text: i.text })),
        seed: voiceSeed(),
        settings: {
          stability: voiceSettings().stability,
          similarity: voiceSettings().similarity_boost,
        },
      }),
    },
  );
  if (!res.ok) throw await toError(res);
  if (!res.body) throw new VoiceProviderError("ElevenLabs returned no body", 502, "empty_response", false);
  return res;
}
