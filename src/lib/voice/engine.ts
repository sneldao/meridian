"use client";

// Client voice engine. ElevenLabs audio arrives as raw PCM (s16le mono) and is
// scheduled straight onto an AudioContext — no MediaSource, no blob buffering,
// works on iOS Safari. Utterances are chunk-sized jobs enqueued as agent_token
// events stream in, so synthesis overlaps generation. Fetches run up to two
// deep — sentence N+1 synthesizes while N's audio is still streaming in —
// while a single serial scheduler holds ordering on one timeline cursor.
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

/** One slice of a job's response: audio bytes plus, on the timestamps path,
 *  the character alignment that rode in the same NDJSON line. */
interface Piece {
  audio?: Uint8Array;
  align?: RawAlignment;
}

interface Call {
  job: Job;
  // Producer side — filled while the upstream stream is still arriving.
  pieces: Piece[];
  done: boolean;
  waiter: (() => void) | null;
  rate: number;
  codec: string;
  alignOff: number;
  /** Cleaned-text → original index map, for projecting karaoke marks. */
  cleanMap?: number[];
  // Scheduler side.
  aligned: { raw: RawAlignment; chunkAt: number | null }[];
  marks: { t: number; char: number }[];
  firstChunkAt: number | null;
  lastChunkAt: number;
  /** Non-PCM payloads accumulate whole for a decodeAudioData at finalize. */
  encoded: Uint8Array[];
}

const LEAD_S = 0.06;
/** How many upstream fetches may run at once. Two is enough to hide synthesis
 *  latency between neighbouring chunks without queuing megabytes of audio. */
const MAX_INFLIGHT = 2;

let available = false;
let enabled = true;
let ctx: AudioContext | null = null;
let kickArmed = false;
let cursor = 0;
let gen = 0;
let abort: AbortController | null = null;
const queue: Job[] = [];
const prepared: Call[] = [];
let producing = 0;
let scheduling = false;
const sources = new Set<AudioBufferSourceNode>();
const timers = new Set<number>();

// Karaoke store: utterance id → elapsed word marks / total chars. `marks` is
// the live view (finished calls plus the in-flight call's partial marks);
// `doneMarks` is the finished-calls contribution rebuilt per utterance.
const marks = new Map<string, { t: number; char: number }[]>();
const doneMarks = new Map<string, { t: number; char: number }[]>();
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
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  // The context is created inside an async pump, outside the click/keypress
  // that allowed it — resume() there is ignored, so the first gesture after
  // creation has to un-suspend it or the crew stays mute forever.
  if (!kickArmed) {
    kickArmed = true;
    const kick = () => {
      if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", kick);
    window.addEventListener("keydown", kick);
    window.addEventListener("touchend", kick);
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
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
    if (
      !scheduling &&
      !producing &&
      prepared.length === 0 &&
      queue.length === 0 &&
      c.currentTime >= cursor
    ) {
      clearInterval(ticker!);
      ticker = null;
    }
  }, 50);
}

export function stopAll() {
  gen++;
  queue.length = 0;
  prepared.length = 0;
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
  doneMarks.clear();
  endAt.clear();
  totals.clear();
  if (spoken.size) {
    spoken.clear();
    notify();
  }
}

export function speakSentence(job: SpeechJobIn) {
  if (!enabled || !available) return;
  if (job.utterTotal != null) totals.set(job.uId, job.utterTotal);
  queue.push({ kind: "speech", ...job });
  ensureTicker();
  drive();
}

export function speakOnce(text: string, agent?: string, cbs?: { onStart?: () => void; onEnd?: () => void }, force = false) {
  if ((!enabled && !force) || !available) {
    cbs?.onEnd?.();
    return;
  }
  queue.push({ kind: "once", text, agent, onStart: cbs?.onStart, onEnd: cbs?.onEnd });
  ensureTicker();
  drive();
}

export function speakDialogue(lines: VoiceLine[], cbs?: { onStart?: () => void; onEnd?: () => void }, force = false) {
  if ((!enabled && !force) || !available) {
    cbs?.onEnd?.();
    return;
  }
  queue.push({ kind: "dialogue", lines, onStart: cbs?.onStart, onEnd: cbs?.onEnd });
  ensureTicker();
  drive();
}

// --- Producer: fetch + parse -------------------------------------------------
// Up to MAX_INFLIGHT calls fetch concurrently; each fills its own `pieces`
// buffer at stream pace. The scheduler drains calls strictly in queue order,
// so ordering survives the overlap.

function pushPiece(call: Call, p: Piece | null) {
  if (!p) return;
  call.pieces.push(p);
  call.waiter?.();
}

function lineToPiece(ln: string): Piece | null {
  let obj: { audio_base64?: string; alignment?: RawAlignment };
  try {
    obj = JSON.parse(ln);
  } catch {
    return null;
  }
  const p: Piece = {};
  if (obj.audio_base64) {
    const bytes = b64ToBytes(obj.audio_base64);
    if (bytes.length >= 2) p.audio = bytes;
  }
  if (obj.alignment?.characters?.length) p.align = obj.alignment;
  return p.audio || p.align ? p : null;
}

async function produce(call: Call) {
  const job = call.job;
  const myGen = gen;
  const signal = abort!.signal;

  let res: Response;
  if (job.kind === "speech") {
    const { clean, map } = cleanForTts(job.text);
    if (!clean) return;
    call.cleanMap = map;
    res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: job.agent, text: clean, prev: job.prev, timestamps: true }),
      signal,
    });
  } else {
    res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body:
        job.kind === "dialogue"
          ? JSON.stringify({ lines: job.lines })
          : JSON.stringify({ agent: job.agent ?? "handoff", text: job.text }),
      signal,
    });
  }
  if (!res.ok || !res.body) return;

  call.rate = Number(res.headers.get("x-voice-sample-rate")) || 22050;
  call.codec = res.headers.get("x-voice-codec") ?? "pcm";
  call.alignOff = Number(res.headers.get("x-voice-align-offset")) || 0;
  const ndjson = (res.headers.get("content-type") ?? "").includes("ndjson");

  const reader = res.body.getReader();
  if (ndjson) {
    const split = createNdjsonSplitter();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (myGen !== gen) {
        try {
          await reader.cancel();
        } catch {
          /* already torn down */
        }
        return;
      }
      if (value?.length) for (const ln of split.push(value)) pushPiece(call, lineToPiece(ln));
    }
    for (const ln of split.flush()) pushPiece(call, lineToPiece(ln));
    return;
  }

  // Raw audio stream. PCM needs sample-aligned chunks, so an odd tail byte
  // carries into the next piece; encoded formats (mp3) just accumulate.
  let carry: Uint8Array | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (myGen !== gen) {
      try {
        await reader.cancel();
      } catch {
        /* already torn down */
      }
      return;
    }
    if (!value?.length) continue;
    if (call.codec !== "pcm") {
      pushPiece(call, { audio: value });
      continue;
    }
    let chunk = value;
    if (carry) {
      const joined = new Uint8Array(carry.length + value.length);
      joined.set(carry);
      joined.set(value, carry.length);
      chunk = joined;
      carry = null;
    }
    if (chunk.length % 2) {
      carry = chunk.slice(-1);
      chunk = chunk.slice(0, -1);
    }
    if (chunk.length) pushPiece(call, { audio: chunk });
  }
}

function drive() {
  if (!abort || abort.signal.aborted) abort = new AbortController();
  while (producing < MAX_INFLIGHT && queue.length) {
    const job = queue.shift()!;
    const call: Call = {
      job,
      pieces: [],
      done: false,
      waiter: null,
      rate: 22050,
      codec: "pcm",
      alignOff: 0,
      aligned: [],
      marks: [],
      firstChunkAt: null,
      lastChunkAt: 0,
      encoded: [],
    };
    prepared.push(call);
    producing++;
    void produce(call)
      .catch(() => {})
      .finally(() => {
        producing--;
        call.done = true;
        call.waiter?.();
        drive();
      });
    ensureScheduler();
  }
}

// --- Scheduler: one timeline, strict order ------------------------------------

function take(call: Call): Promise<Piece | null> {
  if (call.pieces.length) return Promise.resolve(call.pieces.shift()!);
  if (call.done) return Promise.resolve(null);
  return new Promise((r) => {
    call.waiter = () => {
      call.waiter = null;
      r(take(call));
    };
  });
}

function applyPiece(call: Call, p: Piece) {
  const job = call.job;
  if (p.audio?.length) {
    if (call.codec === "pcm") {
      const { at, dur } = schedulePcm(p.audio, call.rate);
      if (call.firstChunkAt === null) {
        call.firstChunkAt = at;
        if (job.kind !== "speech") job.onStart?.();
      }
      call.lastChunkAt = at;
      if (job.kind === "speech") endAt.set(job.uId, at + dur);
    } else {
      call.encoded.push(p.audio);
    }
  }
  if (p.align && job.kind === "speech") {
    call.aligned.push({ raw: p.align, chunkAt: p.audio ? call.lastChunkAt : call.lastChunkAt || null });
    updateMarks(call);
  }
}

// Karaoke marks are rebuilt as each aligned chunk lands, so highlighting runs
// during synthesis instead of starting when the whole clip has arrived.
function updateMarks(call: Call) {
  const job = call.job;
  if (job.kind !== "speech" || !call.cleanMap) return;

  // Absolute vs per-chunk-relative alignment: if a later line's first char
  // starts before the previous line's last char ended, times reset per chunk.
  let relMode = false;
  let prevEnd = -1;
  for (const rec of call.aligned) {
    const st = rec.raw.character_start_times_seconds ?? [];
    const en = rec.raw.character_end_times_seconds ?? [];
    if (prevEnd >= 0 && st.length && st[0] < prevEnd - 0.001) relMode = true;
    if (en.length) prevEnd = en[en.length - 1];
  }

  const map = call.cleanMap;
  const jobMarks: { t: number; char: number }[] = [];
  let cleanOff = 0;
  for (const rec of call.aligned) {
    const chars = rec.raw.characters!;
    const st = rec.raw.character_start_times_seconds ?? [];
    const en = rec.raw.character_end_times_seconds ?? [];
    const base = relMode ? (rec.chunkAt ?? call.lastChunkAt) : (call.firstChunkAt ?? ctx?.currentTime ?? 0);
    let i = 0;
    while (i < chars.length) {
      if (/\s/.test(chars[i])) {
        i++;
        continue;
      }
      let j = i;
      while (j < chars.length && !/\s/.test(chars[j])) j++;
      const cleanIdx = cleanOff + j - 1 - call.alignOff; // last char of the word, tag-stripped
      const origIdx = cleanIdx >= 0 ? map[cleanIdx] : undefined;
      const t = base + (en[j - 1] ?? st[i] ?? 0);
      if (origIdx != null) jobMarks.push({ t, char: job.charBase + origIdx + 1 });
      i = j;
    }
    cleanOff += chars.length;
  }
  jobMarks.sort((x, y) => x.t - y.t);
  call.marks = jobMarks;
  marks.set(job.uId, [...(doneMarks.get(job.uId) ?? []), ...jobMarks]);
  ensureTicker();
}

function scheduleEncoded(call: Call, myGen: number, then: () => void) {
  const job = call.job;
  const c = ctx;
  if (!c || !call.encoded.length || job.kind === "speech") {
    if (job.kind !== "speech") job.onEnd?.();
    return;
  }
  let total = 0;
  for (const b of call.encoded) total += b.byteLength;
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const b of call.encoded) {
    bytes.set(b, off);
    off += b.byteLength;
  }
  void c
    .decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    .then((audio) => {
      if (gen !== myGen) return;
      const src = c.createBufferSource();
      src.buffer = audio;
      src.connect(c.destination);
      const at = Math.max(c.currentTime + LEAD_S, cursor);
      src.start(at);
      sources.add(src);
      src.onended = () => sources.delete(src);
      cursor = at + audio.duration;
      job.onStart?.();
      then();
    })
    .catch(() => job.onEnd?.());
}

function finalize(call: Call, myGen: number) {
  const job = call.job;
  if (job.kind === "speech") {
    if (call.marks.length) {
      doneMarks.set(job.uId, [...(doneMarks.get(job.uId) ?? []), ...call.marks]);
    }
    if (call.firstChunkAt === null) {
      // Nothing played (fetch failed or empty) — pin the karaoke tail so the
      // entry still reads as fully spoken rather than hanging mid-word.
      endAt.set(job.uId, ctx?.currentTime ?? 0);
    }
    return;
  }
  const afterAudio = () => {
    const wait = Math.max(0, (cursor - (ctx?.currentTime ?? 0)) * 1000) + 60;
    const t = window.setTimeout(() => {
      timers.delete(t);
      job.onEnd?.();
    }, wait);
    timers.add(t);
  };
  if (call.encoded.length) {
    scheduleEncoded(call, myGen, afterAudio);
  } else if (call.firstChunkAt === null) {
    job.onEnd?.();
  } else {
    afterAudio();
  }
}

function ensureScheduler() {
  if (scheduling) return;
  scheduling = true;
  const myGen = gen;
  void (async () => {
    try {
      while (myGen === gen && prepared.length) {
        const call = prepared[0];
        ensureCtx()?.resume().catch(() => {});
        for (;;) {
          const piece = await take(call);
          if (myGen !== gen) return;
          if (!piece) break;
          applyPiece(call, piece);
        }
        prepared.shift();
        finalize(call, myGen);
      }
    } finally {
      scheduling = false;
    }
  })();
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
