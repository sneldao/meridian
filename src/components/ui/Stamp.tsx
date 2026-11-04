/* The provenance stamp (design reset Phase 0): one small mark per surface
 * instead of a sentence of hedging. EXAMPLE — the traveller is looking at a
 * built-in example, not their own data; PREVIEW — a plan shown before it is
 * locked; LOCKED — a plan the crew finished and the traveller accepted (it
 * can still be edited elsewhere; the stamp says it's the accepted version,
 * not that it is immutable); FICTIONAL — imagined demo data that never was
 * anyone's. The word is real text at the readability floor, so the mark
 * survives without colour and reads aloud. `kind` only ever describes what
 * is actually on the surface — never stamp LOCKED on an unaccepted plan. */

export type StampKind = "example" | "preview" | "locked" | "fictional";

const LABEL: Record<StampKind, string> = {
  example: "EXAMPLE",
  preview: "PREVIEW",
  locked: "LOCKED",
  fictional: "FICTIONAL",
};

export function Stamp({ kind, className }: { kind: StampKind; className?: string }) {
  return (
    <span className={`stamp${className ? ` ${className}` : ""}`} data-kind={kind}>
      {LABEL[kind]}
    </span>
  );
}
