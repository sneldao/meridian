// Optional Supabase persistence for Meridian's cross-run history.
// Falls back to the file/localStorage path when env vars are unset, so the
// app keeps working in offline/replay mode with no cloud dependency.
//
// Expected table:
//   create table public.meridian_events (
//     id uuid default gen_random_uuid() primary key,
//     kind text not null,
//     payload jsonb not null,
//     created_at timestamptz default now()
//   );

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface RunPayload {
  /** Local runs stamp `Date.now()`; rows read back out of Supabase carry the
   *  table's uuid. Both are stable within a list, so either works as a React
   *  key — but they are different types, and the uuid is only here because
   *  `listRuns` selects it (see below). */
  id?: number | string;
  savedAt: string;
  trip?: { origin: { code: string }; destination: { code: string }; requiredShiftMin: number; direction: string } | null;
  score: number;
  summary: string;
  days?: { label: string; shiftMin: number }[];
  provider?: string;
  fallback?: boolean;
}

export interface EvalPayload {
  savedAt: string;
  scenario: string;
  provider: string;
  fallback: boolean;
  daysLocked: number;
  daysTotal: number;
  meanScore: number | null;
  /** Fraction of the required phase shift the locked days cover, 0..1.
   *  Optional so rows written before coverage was measured still load. */
  coverageRatio?: number | null;
  /** Minutes of the shift still owed when the wearer lands. */
  residualMin?: number | null;
  /** Hours the body clock is projected to be from the destination's night at
   *  landing — what the traveller will actually feel, as opposed to what the
   *  plan claimed. Optional so rows written before the projection existed
   *  still load. */
  projectedHoursOff?: number | null;
  /** The share of the required shift the plan's *timing* actually delivers,
   *  0..1. The declared coverage above is the plan's claim; this is the
   *  model's answer to "can the zeitgebers carry it". */
  deliveredRatio?: number | null;
  attempts: number;
  toolCalls: number;
  violations: Record<string, number>;
  durationMs: number;
}

let client: SupabaseClient | null | undefined;

export function supabaseEnabled(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function clientOrNone(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (!supabaseEnabled()) {
    client = null;
    return null;
  }
  client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

/** Shared admin client for callers outside this module (voice cache storage). */
export function supabaseAdmin(): SupabaseClient | null {
  return clientOrNone();
}

export async function persistRun(run: unknown): Promise<boolean> {
  const c = clientOrNone();
  if (!c) return false;
  const { error } = await c.from("meridian_events").insert({ kind: "run", payload: run });
  return !error;
}

export async function persistCheckIn(checkIn: unknown): Promise<boolean> {
  const c = clientOrNone();
  if (!c) return false;
  const { error } = await c.from("meridian_events").insert({ kind: "checkin", payload: checkIn });
  return !error;
}

export async function listRuns(limit = 20): Promise<RunPayload[]> {
  const c = clientOrNone();
  if (!c) return [];
  const { data, error } = await c
    .from("meridian_events")
    .select("id, payload, created_at")
    .eq("kind", "run")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((row) => {
    const payload = (row.payload ?? {}) as RunPayload;
    // `id` was not selected here, so every row came back with
    // `id: undefined` and /history rendered them under a shared undefined
    // key — React's "each child in a list should have a unique key" warning,
    // on every load, for anyone with cloud persistence on. The payload's own
    // id is the localStorage one and stays authoritative when present.
    return {
      ...payload,
      id: payload.id ?? row.id,
      savedAt: payload.savedAt ?? row.created_at,
    };
  });
}

export async function persistEval(evalRun: EvalPayload): Promise<boolean> {
  const c = clientOrNone();
  if (!c) return false;
  const { error } = await c.from("meridian_events").insert({ kind: "eval", payload: evalRun });
  return !error;
}

export async function listEvals(limit = 200): Promise<EvalPayload[]> {
  const c = clientOrNone();
  if (!c) return [];
  const { data, error } = await c
    .from("meridian_events")
    .select("payload, created_at")
    .eq("kind", "eval")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((row) => {
    const payload = (row.payload ?? {}) as EvalPayload;
    return { ...payload, savedAt: payload.savedAt ?? row.created_at };
  });
}