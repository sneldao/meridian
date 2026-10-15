"use client";

// Client voice engine. ElevenLabs audio arrives as raw PCM (s16le mono) and is
// scheduled straight onto an AudioContext — no MediaSource, no blob buffering,
// works on iOS Safari. Utterances are chunk-sized jobs enqueued as agent_token
// events stream in, so synthesis overlaps generation; the single schedule
// cursor keeps ordering and lets job N+1 synthesize while job N still plays.
// Aligned (timestamps) jobs parse the with-timestamps NDJSON and emit
// char-aligned karaoke marks for CrewFeed highlighting.

import { createNdjsonSplitter } from "./align";
import { cleanForTts } from "./clean";

interface RawAlignment {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
}

export interface VoiceLine {
  agent: string;
  text: string;
}

export interface SpeechJobIn {
  uId: string;
  agent: string;
  text: string;
  charBase: number;
  prev?: string;
  /** Set on the final job of an utterance — once its audio ends the whole
   *  utterance is marked spoken even if some marks never arrived. */
  utterTotal?: number;
}

type Job =
  | ({ kind: "speech" } & SpeechJobIn)
  | { kind: "once"; agent?: string; text: string; onStart?: () => void; onEnd?: () => void }
  | { kind: "dialogue"; lines: VoiceLine[]; onStart?: () => void; onEnd?: () => void };

const LEAD_S = 0.06;

let available = false;
let enabled = true;
let ctx: AudioContext | null = null;
let cursor = 0;
let gen = 0;
let pumping = false;
let abort: AbortController | null = null;
const queue: Job[] = [];
const sources = new Set<AudioBufferSourceNode>();
const timers = new Set<number>();

// Karaoke store: utterance id → elapsed word marks / total chars.
const marks = new Map<string, { t: number; char: number }[]>();
const endAt = new Map<string, number>();
const totals = new Map<string, number>();
const spoken = new Map<string, number>();
const listeners = new Set<() => void>();
let ticker: number | null = null;

function notify() {
  listeners.forEach((l) => l());
}

export function subscribeVoice(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function spokenChars(uId: string | undefined): number {
  if (!uId) return 0;
  return spoken.get(uId) ?? 0;
}

export function initVoice(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return fetch("/api/voice")
    .then((r) => {
      available = r.status !== 204 && r.ok;
      return available;
    })
    .catch(() => {
      available = false;
      return false;
    });
}

export function isVoiceAvailable(): boolean {
  return available;
}

export function setVoiceEnabled(on: boolean) {
  enabled = on;
  if (!on) stopAll();
}

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  return ctx;
}

function schedulePcm(bytes: Uint8Array, rate: number): { at: number; dur: number } {
  const c = ctx!;
  const n = Math.floor(bytes.length / 2);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
  const f32 = new Float32Array(n);
  for (let i = 0; i < n; i++) f32[i] = dv.getInt16(i * 2, true) / 32768;
  const buf = c.createBuffer(1, n, rate);
  buf.copyToChannel(f32, 0);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  const at = Math.max(c.currentTime + LEAD_S, cursor);
  src.start(at);
  sources.add(src);
  src.onended = () => sources.delete(src);
  cursor = at + buf.duration;
  return { at, dur: buf.duration };
}

function ensureTicker() {
  if (ticker != null || typeof window === "undefined") return;
  ticker = window.setInterval(() => {
    const c = ctx;
    if (!c) return;
    let dirty = false;
    for (const [uId, list] of marks) {
      const total = totals.get(uId);
      const end = endAt.get(uId) ?? Infinity;
      let n = 0;
      while (n < list.length && list[n].t <= c.currentTime) n++;
      let v = n ? list[n - 1].char : 0;
      if (total != null && c.currentTime >= end) v = total;
      if ((spoken.get(uId) ?? -1) !== v) {
        spoken.set(uId, v);
        dirty = true;
      }
    }
    if (dirty) notify();
    if (!pumping && queue.length === 0 && c.currentTime >= cursor) {
      clearInterval(ticker!);
      ticker = null;
    }
  }, 50);
}

export function stopAll() {
  gen++;
  queue.length = 0;
  abort?.abort();
  abort = null;
  for (const s of sources) {
    try {
      s.onended = null;
      s.stop();
    } catch {
      /* already stopped */
    }
  }
  sources.clear();
  for (const t of timers) clearTimeout(t);
  timers.clear();
  cursor = 0;
  marks.clear();
  endAt.clear();
  totals.clear();
  if (spoken.size) {
    spoken.clear();
    notify();
  }
}

export function speakSentence(job: SpeechJobIn) {
  if (!enabled || !available) return;
  queue.push({ kind: "speech", ...job });
  ensureTicker();
  void pump(gen);
}

export function speakOnce(text: string, agent?: string, cbs?: { onStart?: () => void; onEnd?: () => void }, force = false) {
  if ((!enabled && !force) || !available) {
    cbs?.onEnd?.();
    return;
  }
  queue.push({ kind: "once", text, agent, onStart: cbs?.onStart, onEnd: cbs?.onEnd });
  ensureTicker();
  void pump(gen);
}

export function speakDialogue(lines: VoiceLine[], cbs?: { onStart?: () => void; onEnd?: () => void }, force = false) {
  if ((!enabled && !force) || !available) {
    cbs?.onEnd?.();
    return;
  }
  queue.push({ kind: "dialogue", lines, onStart: cbs?.onStart, onEnd: cbs?.onEnd });
  ensureTicker();
  void pump(gen);
}

async function pump(myGen: number) {
  if (pumping) return;
  pumping = true;
  abort = new AbortController();
  try {
    while (myGen === gen && queue.length) {
      const job = queue.shift()!;
      const c = ensureCtx();
      if (!c) {
        queue.length = 0;
        return;
      }
      await c.resume().catch(() => {});
      try {
        if (job.kind === "speech") await pumpSpeech(job, abort.signal);
        else if (job.kind === "dialogue") await pumpDialogue(job, abort.signal);
        else await pumpOnce(job, abort.signal);
      } catch {
        /* a failed utterance goes silent; the run continues */
      }
      if (myGen !== gen) return;
    }
  } finally {
    pumping = false;
  }
}

function sampleRate(res: Response): number {
  const v = Number(res.headers.get("x-voice-sample-rate"));
  return v > 0 ? v : 22050;
}

// Chunked utterance with word alignment → karaoke marks. The route prepends an
// audio tag on tag-capable models and reports its length in
// X-Voice-Align-Offset so alignment indices still land on the cleaned text.
async function pumpSpeech(job: SpeechJobIn, signal: AbortSignal) {
  if (job.utterTotal != null) totals.set(job.uId, job.utterTotal);
  const { clean, map } = cleanForTts(job.text);
  if (!clean) return;
  const res = await fetch("/api/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: job.agent, text: clean, prev: job.prev, timestamps: true }),
    signal,
  });
  if (!res.ok || !res.body) return;

  const rate = sampleRate(res);
  const alignOff = Number(res.headers.get("x-voice-align-offset")) || 0;
  const split = createNdjsonSplitter();
  const reader = res.body.getReader();
  let firstChunkAt: number | null = null;
  let lastChunkAt = 0;
  const aligned: { raw: RawAlignment; chunkAt: number | null }[] = [];

  const handleLine = (ln: string) => {
    let obj: { audio_base64?: string; alignment?: RawAlignment };
    try {
      obj = JSON.parse(ln);
    } catch {
      return;
    }
    let chunkAt: number | null = null;
    if (obj.audio_base64) {
      const bytes = b64ToBytes(obj.audio_base64);
      if (bytes.length >= 2) {
        const { at, dur } = schedulePcm(bytes, rate);
        chunkAt = at;
        lastChunkAt = at;
        if (firstChunkAt === null) firstChunkAt = at;
        endAt.set(job.uId, at + dur);
      }
    }
    if (obj.alignment?.characters?.length) aligned.push({ raw: obj.alignment, chunkAt });
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.length) for (const ln of split.push(value)) handleLine(ln);
  }
  for (const ln of split.flush()) handleLine(ln);

  // Absolute vs per-chunk-relative alignment: if a later line's first char
  // starts before the previous line's last char ended, times reset per chunk.
  let relMode = false;
  let prevEnd = -1;
  for (const rec of aligned) {
    const st = rec.raw.character_start_times_seconds ?? [];
    const en = rec.raw.character_end_times_seconds ?? [];
    if (prevEnd >= 0 && st.length && st[0] < prevEnd - 0.001) relMode = true;
    if (en.length) prevEnd = en[en.length - 1];
  }

  const jobMarks: { t: number; char: number }[] = [];
  let cleanOff = 0;
  for (const rec of aligned) {
    const chars = rec.raw.characters!;
    const st = rec.raw.character_start_times_seconds ?? [];
    const en = rec.raw.character_end_times_seconds ?? [];
    const base = relMode ? (rec.chunkAt ?? lastChunkAt) : (firstChunkAt ?? ctx?.currentTime ?? 0);
    let i = 0;
    while (i < chars.length) {
      if (/\s/.test(chars[i])) {
        i++;
        continue;
      }
      let j = i;
      while (j < chars.length && !/\s/.test(chars[j])) j++;
      const cleanIdx = cleanOff + j - 1 - alignOff; // last char of the word, tag-stripped
      const origIdx = cleanIdx >= 0 ? map[cleanIdx] : undefined;
      const t = base + (en[j - 1] ?? st[i] ?? 0);
      if (origIdx != null) jobMarks.push({ t, char: job.charBase + origIdx + 1 });
      i = j;
    }
    cleanOff += chars.length;
  }
  if (jobMarks.length) {
    jobMarks.sort((x, y) => x.t - y.t);
    marks.set(job.uId, [...(marks.get(job.uId) ?? []), ...jobMarks]);
  }
  ensureTicker();
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// One-shot utterance (handoff listen button) — raw PCM stream.
async function pumpOnce(job: Extract<Job, { kind: "once" }>, signal: AbortSignal) {
  const res = await fetch("/api/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: job.agent ?? "handoff", text: job.text }),
    signal,
  });
  if (!res.ok || !res.body) {
    job.onEnd?.();
    return;
  }
  const rate = sampleRate(res);
  job.onStart?.();
  const reader = res.body.getReader();
  let pending: Uint8Array | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.length) continue;
    let chunk = value;
    if (pending) {
      const joined = new Uint8Array(pending.length + value.length);
      joined.set(pending);
      joined.set(value, pending.length);
      chunk = joined;
      pending = null;
    }
    if (chunk.length % 2) {
      pending = chunk.slice(-1);
      chunk = chunk.slice(0, -1);
    }
    if (chunk.length) schedulePcm(chunk, rate);
  }
  const wait = Math.max(0, (cursor - ctx!.currentTime) * 1000) + 60;
  const t = window.setTimeout(() => {
    timers.delete(t);
    job.onEnd?.();
  }, wait);
  timers.add(t);
}

// Multi-voice exchange — one ElevenLabs dialogue call, whole MP3 decoded.
async function pumpDialogue(job: Extract<Job, { kind: "dialogue" }>, signal: AbortSignal) {
  const res = await fetch("/api/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines: job.lines }),
    signal,
  });
  if (!res.ok) {
    job.onEnd?.();
    return;
  }
  const arr = await res.arrayBuffer();
  const c = ctx!;
  try {
    const audio = await c.decodeAudioData(arr.slice(0));
    const src = c.createBufferSource();
    src.buffer = audio;
    src.connect(c.destination);
    const at = Math.max(c.currentTime + LEAD_S, cursor);
    src.start(at);
    sources.add(src);
    cursor = at + audio.duration;
    job.onStart?.();
    src.onended = () => {
      sources.delete(src);
      job.onEnd?.();
    };
  } catch {
    job.onEnd?.();
  }
}
