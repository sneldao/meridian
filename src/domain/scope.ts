// Scope guard — one definition of "advice on timing, never medication".
//
// The crew's boundary is the same one a regulated health product keeps: say
// *when*, never *how much*, and never make a clinical claim. The deterministic
// scorer enforces it on submitted plan notes; this module is the same rules
// applied to the crew's spoken narration, which streams live to the user and
// feeds the next agent's prompt. A gate on the artifact that leaves the
// channel unchecked is not a gate.
//
// Patterns live here so the scorer and the narration scrubber can never drift
// apart — a plan that fails the gate and the sentence describing it must be
// judged by the same rule.

export const REDACTION = "[withheld: outside crew scope]";

const DOSE_SOURCE = "\\b\\d+(\\.\\d+)?\\s*(mg|mcg|g|iu|milligram|microgram)\\b";
const PRESCRIBE_SOURCE =
  "\\b(take|prescribe|dose of)\\b.{0,20}\\b(melatonin|pill|tablet|supplement)\\b";
const CLAIM_SOURCE =
  "\\b(cure|cures|treats?|diagnos|prevents? disease|medical advice|clinically proven to fix)\\b";

const SOURCES = [DOSE_SOURCE, PRESCRIBE_SOURCE, CLAIM_SOURCE];

/** Dose language: a quantity, or an instruction to take something. */
export function prescribesDose(text: string): boolean {
  return (
    new RegExp(DOSE_SOURCE, "i").test(text) || new RegExp(PRESCRIBE_SOURCE, "i").test(text)
  );
}

/** Diagnostic or curative language — the crew cites evidence, never asserts. */
export function makesClinicalClaim(text: string): boolean {
  return new RegExp(CLAIM_SOURCE, "i").test(text);
}

/** Fresh non-shared regexes: a module-level /g regex carries lastIndex between
 *  calls and silently skips matches. Correctness bug, not style. */
function spansOf(text: string, source: string): [number, number][] {
  const re = new RegExp(source, "gi");
  const out: [number, number][] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push([m.index, m.index + m[0].length]);
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

/** Every out-of-scope span in `text`, as [start, end) index pairs. */
export function unsafeSpans(text: string): [number, number][] {
  return SOURCES.flatMap((s) => spansOf(text, s)).sort((a, b) => a[0] - b[0]);
}

export function isOutOfScope(text: string): boolean {
  return unsafeSpans(text).length > 0;
}

/** Replace every out-of-scope span with a marker. Used on completed text. */
export function scrub(text: string): string {
  const spans = unsafeSpans(text);
  if (!spans.length) return text;
  let out = "";
  let cursor = 0;
  for (const [start, end] of merge(spans)) {
    out += text.slice(cursor, start) + REDACTION;
    cursor = end;
  }
  return out + text.slice(cursor);
}

function merge(spans: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const span of spans) {
    const last = out[out.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else out.push([...span] as [number, number]);
  }
  return out;
}

/** Longest possible out-of-scope match. The streaming guard holds back this
 *  many characters so a pattern spanning two deltas is still caught whole. */
export const MAX_SPAN_CHARS = 48;

/**
 * Streaming scrubber for narration.
 *
 * Deltas arrive mid-word, so a pattern can straddle a chunk boundary — and a
 * match can also be *incomplete* at the point we would emit it ("take 3" with
 * "mg" still in flight). So: hold back a tail, redact anything that touches the
 * cut, and let `flush()` re-scrub the remainder against the full text once the
 * stream ends. The completed text is always scrubbed authoritatively by
 * `scrub()` at the call site; this is what stops an unsafe span being *shown*.
 */
export class ScopeGuard {
  private buf = "";
  private readonly tail: number;

  constructor(tail: number = MAX_SPAN_CHARS) {
    this.tail = tail;
  }

  /** Feed a delta; returns the text that is safe to emit right now. */
  push(delta: string): string {
    this.buf += delta;
    if (this.buf.length <= this.tail) return "";
    const cut = this.buf.length - this.tail;
    const head = this.redactUpTo(this.buf, cut);
    this.buf = this.buf.slice(cut);
    return head;
  }

  /** Emit whatever is still buffered, scrubbed against the whole remainder. */
  flush(): string {
    const rest = this.buf;
    this.buf = "";
    return scrub(rest);
  }

  /** Everything buffered so far, scrubbed — the authoritative view. */
  full(): string {
    return scrub(this.buf);
  }

  /** Redact spans intersecting [0, cut); spans reaching past cut are redacted
   *  up to cut and complete naturally once their tail is scrubbed. */
  private redactUpTo(text: string, cut: number): string {
    const spans = unsafeSpans(text);
    let head = text.slice(0, cut);
    for (const [start, end] of merge(spans)) {
      if (start >= cut) break;
      if (start < head.length) head = head.slice(0, start) + REDACTION;
      void end;
    }
    return head;
  }
}
