import type {
  AdherenceProfile,
  CheckIn,
  CheckInRequest,
  CheckInStatus,
  InterventionKind,
} from "./types";

// Turns "what the wearer actually did" into the scorer's inputs.
// The static ADHERENCE_PROFILE fixture is the prior; every recorded check-in
// updates it, so the eval loop scores plans against earned behaviour rather
// than declared assumptions.

const KIND_WORDS: [RegExp, InterventionKind][] = [
  [/\b(light|sun|sunlight|outside|bright)\b/i, "light_exposure"],
  [/\b(screen|dark|dim|avoid)\b/i, "avoid_light"],
  [/\b(sleep|bed|slept|bedtime|woke|wake|nap)\b/i, "sleep_window"],
  [/\b(coffee|caffeine|espresso|tea)\b/i, "caffeine_cutoff"],
  [/\b(melatonin)\b/i, "melatonin"],
  [/\b(gym|exercise|run|walk|workout)\b/i, "exercise"],
  [/\b(meal|dinner|lunch|breakfast|ate|eat)\b/i, "meal_timing"],
];

const CLOCK_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;

/** Parse one line of free-text pushback into a structured check-in.
 * Deterministic, generous, and biased toward "didn't happen" when the text is
 * negative — a missed ask is the signal that matters most. */
export function parseCheckInText(req: CheckInRequest): CheckIn {
  const text = (req.text ?? "").trim();
  const lower = text.toLowerCase();

  let status: CheckInStatus = req.status ?? "done";
  if (!req.status) {
    if (/\b(skip|skipped|missed|didn'?t|couldn'?t|can'?t|never got|forgot|no way|bailed)\b/.test(lower)) {
      status = "skipped";
    } else if (/\b(too (early|hard|much)|brutal|rough|awful|exhausted|struggled)\b/.test(lower)) {
      status = "harder";
    } else if (/\b(sort of|half|partly|some of|a bit)\b/.test(lower)) {
      status = "partial";
    } else if (/\b(easy|easier|fine|felt good|no problem|nailed)\b/.test(lower)) {
      status = "easier";
    }
  }

  let kind: InterventionKind | undefined = req.kind;
  if (!kind) {
    for (const [re, k] of KIND_WORDS) {
      if (re.test(lower)) {
        kind = k;
        break;
      }
    }
  }

  // Pull a clock time if one is present — "couldn't do the 5am light" pins the
  // check-in to a specific intervention start.
  let startMin: number | undefined;
  const m = text.match(CLOCK_RE);
  if (m) {
    let h = parseInt(m[1], 10);
    const mm = m[2] ? parseInt(m[2], 10) : 0;
    const mer = m[3]?.toLowerCase();
    if (mer === "pm" && h < 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    startMin = h * 60 + mm;
  }

  return {
    id: `ci-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    dayIndex: req.dayIndex ?? inferDayIndex(text),
    kind,
    startMin,
    status,
    text: text || undefined,
    at: Date.now(),
  };
}

function inferDayIndex(text: string): number {
  const m = text.match(/\bd\s*([+-]?\d+)\b/i);
  if (m) {
    // Fixture convention: D-3 -> 0, D-1 -> 2, flight/D0 -> 3, D+1 -> 4.
    const idx = 3 + parseInt(m[1], 10);
    return Math.max(0, Math.min(4, idx));
  }
  return 0;
}

/** Fold check-in history into the adherence prior. Callers get a profile that
 * reflects observed behaviour: skipped early asks push the compliance floor
 * later, repeatedly-failed kinds register as weaknesses. */
export function foldCheckIns(base: AdherenceProfile, checkIns: CheckIn[]): AdherenceProfile {
  if (!checkIns.length) return base;

  const skippedKinds = new Set<string>(base.weakAt);
  let floor = base.ignoresInterventionsBeforeMin;

  const earlySkips = checkIns.filter(
    (c) => (c.status === "skipped" || c.status === "harder") && c.startMin !== undefined && c.startMin < floor,
  );
  if (earlySkips.length) {
    // The floor moves to the latest early-ask time that still failed, plus a
    // margin — evidence that the prior floor was too optimistic.
    const latest = Math.max(...earlySkips.map((c) => c.startMin!));
    floor = Math.min(10 * 60, latest + 30);
  }

  for (const c of checkIns) {
    if ((c.status === "skipped" || c.status === "harder") && c.kind) skippedKinds.add(kindLabel(c.kind));
  }

  return {
    ignoresInterventionsBeforeMin: floor,
    weakAt: [...skippedKinds],
    strongAt: base.strongAt,
  };
}

export function kindLabel(kind: InterventionKind): string {
  return kind.replace(/_/g, " ");
}

/** One-line human summary of a check-in for prompts and the crew feed. */
export function summarizeCheckIn(c: CheckIn): string {
  const what = c.kind ? kindLabel(c.kind) : "day";
  const when = c.startMin !== undefined ? ` at ${Math.floor(c.startMin / 60)}:${String(c.startMin % 60).padStart(2, "0")}` : "";
  return `${what}${when}: ${c.status}${c.text ? ` — "${c.text}"` : ""}`;
}
