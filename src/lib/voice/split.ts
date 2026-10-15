// Sentence chunking for streamed text. An agent's utterance arrives token by
// token; synthesis has to start on the first complete sentence while the rest
// is still being written, or the crew finishes typing before it starts talking.
//
// Chunks are contiguous slices of the original buffer — start/end offsets are
// preserved because the karaoke map is keyed on character position in the
// displayed text. minChars grouping absorbs false splits on abbreviations
// ("e.g. keep…") and bare list markers ("5.") because the fragment merges into
// the chunk that follows it.

export interface VoiceChunk {
  text: string;
  /** Offset of this chunk's first character in the source buffer. */
  start: number;
  /** Offset just past the last character. */
  end: number;
}

export interface ChunkOptions {
  /** Emit only once a chunk is at least this long. */
  minChars?: number;
  /** Split any single oversized run rather than overflow the request. */
  maxChars?: number;
  /** Treat the buffer as complete (utterance over) and emit the remainder. */
  flush?: boolean;
}

const DEFAULTS = { minChars: 60, maxChars: 700 };

const TERMINATORS = new Set([".", "!", "?", "…"]);
const CLOSERS = new Set(['"', "'", "”", "’", ")", "]", "*"]);
const SENT_START = /[A-Za-z0-9*"('—–-]/;

/**
 * Indices just past each sentence boundary. A boundary needs a terminator, any
 * closers, then whitespace followed by a plausible sentence start — so
 * "10.1177/0748730418789236" and "0.95" never split. Newlines are boundaries on
 * their own. Terminators inside [audio tags] are skipped; a fragment with
 * fewer than four letters ("e.g.", "5.") merges forward.
 */
function sentenceEnds(text: string, flush: boolean): number[] {
  const ends: number[] = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "[") depth++;
    else if (ch === "]" && depth > 0) depth--;
    if (depth > 0) continue;
    if (ch === "\n") {
      ends.push(i + 1);
      continue;
    }
    if (!TERMINATORS.has(ch)) continue;
    let j = i + 1;
    while (j < text.length && (CLOSERS.has(text[j]) || TERMINATORS.has(text[j]))) j++;
    if (j < text.length && /\s/.test(text[j])) {
      let k = j;
      while (k < text.length && /\s/.test(text[k])) k++;
      if (k < text.length && SENT_START.test(text[k])) ends.push(j);
    } else if (flush && j >= text.length) {
      ends.push(j);
    }
  }
  return ends;
}

/** Cut an oversized run at weak breaks (comma/semicolon/newline), then spaces. */
function hardSplit(chunk: VoiceChunk, maxChars: number): VoiceChunk[] {
  if (chunk.text.length <= maxChars) return [chunk];
  const out: VoiceChunk[] = [];
  let at = chunk.start;
  let rest = chunk.text;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    let cut = -1;
    for (const marker of [",", ";", "\n"]) cut = Math.max(cut, window.lastIndexOf(marker));
    if (cut <= 0) cut = rest.lastIndexOf(" ", maxChars);
    if (cut <= 0) cut = maxChars;
    out.push({ text: rest.slice(0, cut + 1), start: at, end: at + cut + 1 });
    at += cut + 1;
    rest = rest.slice(cut + 1);
  }
  if (rest.length) out.push({ text: rest, start: at, end: chunk.end });
  return out;
}

/**
 * Pull the speakable chunks off the head of a still-growing buffer; the
 * remainder stays buffered for the next token. With `flush`, the utterance is
 * over and everything left is spoken as one final chunk.
 */
export function takeChunks(
  buffer: string,
  opts: ChunkOptions = {},
): { chunks: VoiceChunk[]; rest: string } {
  const { minChars, maxChars, flush } = { ...DEFAULTS, ...opts };
  if (!buffer.trim()) return { chunks: [], rest: flush ? "" : buffer };

  const ends = sentenceEnds(buffer, Boolean(flush));
  // Only boundaries before the last one are trusted mid-stream: the text after
  // it may still be mid-sentence once the next token lands.
  const boundary = flush ? buffer.length : ends.length ? ends[ends.length - 1] : 0;
  if (!boundary) return { chunks: [], rest: buffer };

  // Sentences accumulate into a chunk until minChars; chunks stay contiguous
  // slices so offsets survive intact.
  const chunks: VoiceChunk[] = [];
  let chunkStart = 0;
  for (const end of ends) {
    if (end > boundary) break;
    if (buffer.slice(chunkStart, end).replace(/[^a-zA-Z]/g, "").length < 4) continue;
    if (end - chunkStart >= minChars || (flush && end === boundary)) {
      chunks.push({ text: buffer.slice(chunkStart, end), start: chunkStart, end });
      chunkStart = end;
    }
  }
  if (flush && chunkStart < buffer.length) {
    chunks.push({ text: buffer.slice(chunkStart), start: chunkStart, end: buffer.length });
  }
  const rest = buffer.slice(chunkStart);
  const out = chunks.flatMap((c) => hardSplit(c, maxChars));
  return { chunks: out, rest };
}
