import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/tools/supabase";

// Synthesised audio is a pure function of its inputs, so a replay of the same
// scripted transcript should cost nothing and arrive instantly. Two tiers:
// an in-process LRU (stage machine, one browser, hot loop) and a private
// Supabase Storage bucket that survives restarts and is shared between the
// laptop and the deployed site.
//
// Keyed on everything that changes the waveform, including the audio tag and the
// seed: a cache that ignores the model would serve flash-tier audio after a
// switch to v4 and never tell anyone why the crew went flat.

const BUCKET = process.env.MERIDIAN_VOICE_BUCKET ?? "meridian-voice";
/** ~4s of 22kHz PCM per clip, so this is a few hundred clips of headroom. */
const MAX_MEMORY_BYTES = Number(process.env.MERIDIAN_VOICE_CACHE_BYTES ?? 24 * 1024 * 1024);
const MAX_OBJECT_BYTES = 8 * 1024 * 1024;

const memory = new Map<string, Uint8Array>();
let memoryBytes = 0;
let bucketReady = false;

export interface CacheKeyParts {
  kind: "tts" | "dialogue";
  /** Voice id for tts; sorted voice ids joined for dialogue. */
  voice: string;
  model: string;
  text: string;
  format: string;
  align: boolean;
  seed: number;
  stability: number;
  similarity: number;
  /** Previous-sentence prosody context (tts only). Changes the waveform, so
   *  it must change the key — a hit without it can serve the wrong delivery. */
  prev?: string;
}

export function voiceCacheKey(parts: CacheKeyParts): string {
  const canonical = JSON.stringify(
    Object.keys(parts)
      .sort()
      .map((k) => [k, (parts as unknown as Record<string, unknown>)[k]]),
  );
  return createHash("sha1").update(canonical).digest("hex");
}

function remember(key: string, bytes: Uint8Array) {
  if (bytes.byteLength > MAX_MEMORY_BYTES) return;
  if (memory.has(key)) memoryBytes -= memory.get(key)!.byteLength;
  memory.set(key, bytes);
  memoryBytes += bytes.byteLength;
  while (memoryBytes > MAX_MEMORY_BYTES && memory.size > 1) {
    const oldest = memory.keys().next().value as string;
    memoryBytes -= memory.get(oldest)!.byteLength;
    memory.delete(oldest);
  }
}

function objectPath(key: string): string {
  return `${key.slice(0, 2)}/${key}`;
}

export type CacheHit = { source: "memory" | "supabase"; bytes: Uint8Array };

export async function lookupVoice(key: string): Promise<CacheHit | null> {
  const hot = memory.get(key);
  if (hot) {
    // Refresh recency without churning the byte tally.
    memory.delete(key);
    memory.set(key, hot);
    return { source: "memory", bytes: hot };
  }
  const client = supabaseAdmin();
  if (!client) return null;
  const { data, error } = await client.storage.from(BUCKET).download(objectPath(key));
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  remember(key, bytes);
  return { source: "supabase", bytes };
}

/**
 * Best-effort: a cache write must never fail a synthesis the caller already
 * paid for. Storage being unreachable degrades to memory-only, which is still
 * the difference between a flat and an instant second take.
 */
export async function storeVoice(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  remember(key, bytes);
  const client = supabaseAdmin();
  if (!client || bytes.byteLength > MAX_OBJECT_BYTES) return;
  try {
    if (!bucketReady) {
      const created = await client.storage.createBucket(BUCKET, { public: false });
      // "already exists" is the normal path on every boot after the first.
      if (created.error && !/exist/i.test(created.error.message ?? "")) return;
      bucketReady = true;
    }
    const { error } = await client.storage
      .from(BUCKET)
      .upload(objectPath(key), bytes, { contentType, upsert: false });
    // Bucket removed between create and write: clear the flag so the next
    // write re-runs the create path instead of failing forever.
    if (error && /not.?found|not exist/i.test(error.message ?? "")) bucketReady = false;
  } catch {
    /* memory cache still stands */
  }
}

export function voiceCacheBackend(): "supabase" | "memory" {
  return supabaseAdmin() ? "supabase" : "memory";
}

export function voiceCacheStats() {
  return { entries: memory.size, bytes: memoryBytes, backend: voiceCacheBackend() };
}
