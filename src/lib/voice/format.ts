// ElevenLabs `output_format` is a `codec_sampleRate[_bitrate]` string. The
// player needs the codec and the rate to feed bytes into the right pipeline,
// and the cache key needs both to keep two formats from colliding.

export type VoiceCodec = "pcm" | "mp3" | "opus" | "ulaw" | "alaw" | "unknown";

export interface ParsedFormat {
  codec: VoiceCodec;
  sampleRate: number;
  bitrateKbps?: number;
  /** PCM is 16-bit little-endian mono; the player needs bytes-per-sample. */
  bytesPerSample: number;
  channels: number;
}

const RAW_CODECS = new Set(["ulaw", "alaw"]);

export function parseOutputFormat(format: string): ParsedFormat {
  const parts = format.split("_");
  const codec = parts[0] as VoiceCodec;
  const known: VoiceCodec = ["pcm", "mp3", "opus", "ulaw", "alaw"].includes(codec) ? codec : "unknown";
  const sampleRate = Number(parts[1]) || (known === "opus" ? 48_000 : 22_050);
  const bitrateKbps = parts[2] ? Number(parts[2]) : undefined;
  return {
    codec: known,
    sampleRate,
    ...(bitrateKbps ? { bitrateKbps } : {}),
    bytesPerSample: known === "pcm" ? 2 : RAW_CODECS.has(known) ? 1 : 0,
    channels: 1,
  };
}

/** Bytes of PCM per second of audio — the player's clock depends on this. */
export function pcmBytesPerSecond(parsed: ParsedFormat): number {
  return parsed.sampleRate * parsed.bytesPerSample * parsed.channels;
}
