/**
 * The scorer's verdict, as text that survives without colour.
 *
 * This label exists as a rule, not just a string: `.evchip.pass` and
 * `.evchip.warn` render the same pill shape and differed only in hue, so a
 * failing check read as a passing one to anyone who cannot separate them —
 * and to anyone reading the DOM. The glyph and the issue count are load-bearing,
 * not decoration; `eval-chip.test.ts` fails if the two states ever render
 * identical text again.
 */
export function evalChipLabel(score: number, violations: string[]): string {
  const s = score.toFixed(2);
  if (!violations.length) return `✓ check ${s}`;
  const n = violations.length;
  return `✗ check ${s} · ${n} ${n === 1 ? "issue" : "issues"}`;
}

/** Tooltip naming the actual gate failures, so the reason isn't colour-only. */
export function evalChipTitle(violations: string[]): string {
  return violations.length
    ? `Failed the gate — ${violations.join(", ")}`
    : "Passed the deterministic gate";
}