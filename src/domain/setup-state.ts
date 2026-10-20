// The setup's answers, kept.
//
// Two rules, learned from the reference build and worth more than the code
// that stores them:
//
//   1. The setup must never silently lose an answer.
//   2. The setup must never ask a question it already has an answer to.
//
// So the answers are written as they are given, the step the traveller
// reached is written with them, and reopening the setup resumes rather than
// restarting. The traveller who answers three questions, closes the tab, and
// comes back tomorrow has not lost an evening's work to a refresh.
//
// The state is small, local, and per-browser: it is the traveller's own
// answers about themselves, and it never leaves the device unless the
// deployment has persistence configured (and then only the plan does).

import type { OnboardingState } from "@/domain/types";

const KEY = "meridian:setup-v1";

/** The first step the traveller has not answered. */
export function firstUnansweredStep(state: Partial<OnboardingState>): number {
  if (state.bedtimeMin === undefined) return 0;
  if (state.protect === undefined) return 1;
  if (state.wearableOptedIn === undefined) return 2;
  if (state.tone === undefined) return 3;
  return 4; // everything answered
}

/** One line of what they have already told us, for the welcome-back moment. */
export function setupSummary(state: Partial<OnboardingState>): string {
  const parts: string[] = [];
  if (state.bedtimeMin !== undefined && state.wakeMin !== undefined) {
    parts.push(`sleep ${hhmm(state.bedtimeMin)}–${hhmm(state.wakeMin)}`);
  }
  if (state.protect !== undefined) {
    parts.push(
      state.protect.length === 0
        ? "no commitments to protect"
        : `${state.protect.length} commitment${state.protect.length === 1 ? "" : "s"} to protect`,
    );
  }
  if (state.wearableOptedIn !== undefined) {
    parts.push(state.wearableOptedIn ? "a wearable's numbers" : "what you tell us");
  }
  if (state.tone !== undefined) parts.push(`${state.tone} voice`);
  return parts.join(" · ");
}

/** Whether there is a partial save worth offering to resume. */
export function hasPartialSetup(state: Partial<OnboardingState> | null): boolean {
  if (!state) return false;
  return firstUnansweredStep(state) > 0 && firstUnansweredStep(state) < 4;
}

export function loadSetup(): Partial<OnboardingState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSetup(state: Partial<OnboardingState>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: the setup still works in memory, and losing the
    // resume is better than a crash.
  }
}

export function clearSetup(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function hhmm(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
