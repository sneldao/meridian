import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { supabaseAdmin } from "@/tools/supabase";

/** The post-landing receipt: what the plan claimed vs what its timing
 *  delivered, from the same projection the arrival screen reports. */
export interface ArrivalReceipt {
  hoursOff: number;
  lowHours: number;
  highHours: number;
  deliveredHours: number;
  claimedHours: number;
  requiredHours: number;
  baselineHours: number;
}

export interface SharedPlanPayload {
  briefing?: unknown;
  trip?: unknown;
  arrival?: ArrivalReceipt | null;
  sharedAt?: string;
}

const dir = () => path.join(process.cwd(), "artifacts", "share");

/** Persist a share payload behind a fresh /plan/{id} id. Supabase when
 *  configured (meridian_shares — durable across deploys and ephemeral
 *  disks), filesystem otherwise, so replay mode needs zero services. */
export async function saveSharedPlan(payload: {
  briefing?: unknown;
  trip?: unknown;
  arrival?: ArrivalReceipt | null;
}): Promise<string> {
  const id = randomBytes(5).toString("hex"); // unguessable enough for a demo
  const sb = supabaseAdmin();
  if (sb) {
    const { error } = await sb.from("meridian_shares").insert({
      id,
      briefing: payload.briefing ?? null,
      trip: payload.trip ?? null,
      arrival: payload.arrival ?? null,
    });
    if (!error) return id;
    // Fall through to disk rather than lose the share.
  }
  mkdirSync(dir(), { recursive: true });
  writeFileSync(
    path.join(dir(), `${id}.json`),
    JSON.stringify({ ...payload, sharedAt: new Date().toISOString() }),
  );
  return id;
}

/** Read a shared plan card payload: Supabase first, filesystem fallback so
 *  links minted by the demo path still resolve. `countView` increments
 *  meridian_shares.view_count — pass it only on the recipient-facing page;
 *  the OG image must not count crawler unfurls as viewers. */
export async function loadSharedPlan(
  id: string,
  opts?: { countView?: boolean },
): Promise<SharedPlanPayload | null> {
  const sb = supabaseAdmin();
  if (sb) {
    const { data } = await sb
      .from("meridian_shares")
      .select("briefing, trip, arrival, shared_at")
      .eq("id", id)
      .maybeSingle();
    if (data) {
      if (opts?.countView) {
        sb.rpc("increment_share_view", { share_id: id }).then(
          () => {},
          () => {},
        );
      }
      return {
        briefing: data.briefing ?? undefined,
        trip: data.trip ?? undefined,
        arrival: (data.arrival as ArrivalReceipt | null) ?? null,
        sharedAt: data.shared_at,
      };
    }
  }
  const p = path.join(dir(), `${id}.json`);
  return existsSync(p)
    ? (JSON.parse(readFileSync(p, "utf8")) as SharedPlanPayload)
    : null;
}

/** Count a recipient who came through /plan/{id} and committed their own
 *  trip — the funnel's bottom metric. No-op without Supabase: the disk
 *  path has no counter and a missing number beats an invented one. */
export async function recordShareRecipient(id: string): Promise<boolean> {
  const sb = supabaseAdmin();
  if (!sb) return false;
  const { error } = await sb.rpc("increment_share_recipient", { share_id: id });
  return !error;
}
