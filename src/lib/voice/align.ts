// Parses the NDJSON stream from `…/stream/with-timestamps`. ElevenLabs returns
// one JSON object per line: base64 audio plus a *character*-level alignment, so
// word timings have to be rebuilt by grouping characters.
//
// Server and browser both use this, so it stays dependency-free: no Buffer, no
// process.env, no DOM.

export interface SpokenWord {
  text: string;
  /** Seconds from the start of the utterance. */
  start: number;
  end: number;
}

export interface AlignChunk {
  audio: Uint8Array;
  words: SpokenWord[];
}

interface RawAlignment {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
}

/**
 * Splits a byte stream on newlines without assuming a chunk ends on one. A
 * brace-matching pass covers the case where an upstream writes concatenated
 * JSON objects with no delimiter at all.
 */
export function createNdjsonSplitter(): {
  push: (bytes: Uint8Array) => string[];
  flush: () => string[];
} {
  const decoder = new TextDecoder();
  let pending = "";

  const harvest = (final: boolean): string[] => {
    const lines: string[] = [];
    for (;;) {
      const nl = pending.indexOf("\n");
      if (nl >= 0) {
        const line = pending.slice(0, nl).trim();
        pending = pending.slice(nl + 1);
        if (line) lines.push(line);
        continue;
      }
      const balanced = closingBrace(pending);
      if (balanced > 0) {
        const line = pending.slice(0, balanced).trim();
        pending = pending.slice(balanced);
        if (line) lines.push(line);
        continue;
      }
      if (final && pending.trim()) {
        lines.push(pending.trim());
        pending = "";
      }
      return lines;
    }
  };

  return {
    push(bytes: Uint8Array) {
      pending += decoder.decode(bytes, { stream: true });
      return harvest(false);
    },
    flush() {
      pending += decoder.decode();
      return harvest(true);
    },
  };
}

function closingBrace(text: string): number {
  if (text.charCodeAt(0) !== 0x7b) return -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Group character timings into words; whitespace ends a word. */
export function wordsFromAlignment(al: RawAlignment | undefined): SpokenWord[] {
  const chars = al?.characters;
  const starts = al?.character_start_times_seconds;
  const ends = al?.character_end_times_seconds;
  if (!chars?.length || !starts?.length || !ends?.length) return [];

  const words: SpokenWord[] = [];
  let text = "";
  let start = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const isSpace = /\s/.test(ch);
    if (isSpace) {
      if (text) words.push({ text, start, end: ends[i - 1] ?? start });
      text = "";
      continue;
    }
    if (!text) start = starts[i] ?? 0;
    text += ch;
  }
  if (text) words.push({ text, start, end: ends[ends.length - 1] ?? start });
  return words;
}

/**
 * `normalized_alignment` reflects the text the model actually spoke
 * ("8 AM" → "eight AM"), which is what the highlight has to follow; the raw
 * alignment is keyed to the input spelling and drifts on normalised tokens.
 */
export function parseAlignChunk(
  line: string,
  opts: { timeBase?: number } = {},
): AlignChunk | null {
  let payload: {
    audio_base64?: string;
    alignment?: RawAlignment;
    normalized_alignment?: RawAlignment;
  };
  try {
    payload = JSON.parse(line);
  } catch {
    return null;
  }
  if (!payload.audio_base64) return null;

  const raw = wordsFromAlignment(payload.normalized_alignment ?? payload.alignment);
  const base = opts.timeBase ?? 0;
  return {
    audio: base64ToBytes(payload.audio_base64),
    words: raw.map((w) => ({ ...w, start: w.start + base, end: w.end + base })),
  };
}
