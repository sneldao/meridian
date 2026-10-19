// Server side of Web Push. Enabled when VAPID_PRIVATE_KEY +
// NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_SUBJECT are set AND Supabase is
// configured — without them the app stays honest (in-tab reminders only).
//
// Table: supabase/migrations/20261018213000_push_subscriptions.sql
import webpush from "web-push";
import { supabaseAdmin } from "@/tools/supabase";

const TABLE = "meridian_push_subscriptions";

export function pushEnabled(): boolean {
  return Boolean(
    process.env.VAPID_PRIVATE_KEY &&
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_SUBJECT &&
      supabaseAdmin(),
  );
}

export function vapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
}

function vapidDetails() {
  return {
    subject: process.env.VAPID_SUBJECT!,
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    privateKey: process.env.VAPID_PRIVATE_KEY!,
  };
}

export interface PushKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionRow {
  endpoint: string;
  feed_id: string;
  keys: PushKeys;
  sent: Record<string, number>;
}

export async function saveSubscription(
  feedId: string,
  endpoint: string,
  keys: PushKeys,
): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return false;
  const { error } = await db.from(TABLE).upsert({
    endpoint,
    feed_id: feedId,
    keys,
    updated_at: new Date().toISOString(),
  });
  return !error;
}

export async function deleteSubscription(endpoint: string): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return false;
  const { error } = await db.from(TABLE).delete().eq("endpoint", endpoint);
  return !error;
}

export async function listSubscriptions(): Promise<PushSubscriptionRow[]> {
  const db = supabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from(TABLE)
    .select("endpoint, feed_id, keys, sent");
  if (error || !data) return [];
  return data.map((r) => ({
    endpoint: r.endpoint as string,
    feed_id: r.feed_id as string,
    keys: r.keys as PushKeys,
    sent: (r.sent as Record<string, number>) ?? {},
  }));
}

export async function markSent(
  endpoint: string,
  sent: Record<string, number>,
): Promise<void> {
  const db = supabaseAdmin();
  if (!db) return;
  await db
    .from(TABLE)
    .update({ sent, updated_at: new Date().toISOString() })
    .eq("endpoint", endpoint);
}

export async function sendPush(
  endpoint: string,
  keys: PushKeys,
  payload: { title: string; body: string; id: string },
): Promise<"ok" | "gone" | "error"> {
  try {
    await webpush.sendNotification(
      { endpoint, keys },
      JSON.stringify(payload),
      { vapidDetails: vapidDetails(), TTL: 300 },
    );
    return "ok";
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    // 404/410 = the browser revoked the endpoint — dead subscription.
    if (code === 404 || code === 410) return "gone";
    return "error";
  }
}
