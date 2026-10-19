// Reminder dispatch — the half of Web Push that can't live in the browser.
// Call on a schedule (every ~15 min is the intent):
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/dispatch
//
// For each stored subscription it reads the feed's plan, sends every
// reminder-worthy step due inside the dispatch window, and dedupes via the
// row's `sent` map. Steps slightly in the past are still sent — late beats
// never when a cron tick is missed. Dead endpoints (404/410) are culled.
import { rateLimit } from "@/lib/rateLimit";
import { readFeed } from "@/lib/feed-store";
import { upcomingReminders } from "@/lib/reminders";
import {
  deleteSubscription,
  listSubscriptions,
  markSent,
  pushEnabled,
  sendPush,
} from "@/lib/push";

// How far ahead to send — the dispatch interval, so each step is covered by
// exactly one tick and arrives up to ~15 min early rather than late.
const HORIZON_MS = 15 * 60 * 1000;
// Steps up to this far in the past still send — covers a missed tick.
const LATE_MS = 5 * 60 * 1000;
// sent-map entries older than this are pruned — keeps the row small.
const SENT_TTL_MS = 7 * 24 * 3600 * 1000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "cron disabled — CRON_SECRET unset" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!pushEnabled()) {
    return Response.json({ ok: false, disabled: true }, { status: 503 });
  }
  const rl = rateLimit(req, "cron-dispatch", { limit: 30, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return Response.json({ error: "rate limited" }, { status: 429 });

  const nowMs = Date.now();
  const subs = await listSubscriptions();
  let sent = 0;
  let gone = 0;
  let failed = 0;

  for (const sub of subs) {
    const feed = await readFeed(sub.feed_id);
    if (!feed) {
      // Feed deleted (or unreadable) — the subscription points at nothing.
      await deleteSubscription(sub.endpoint);
      gone++;
      continue;
    }
    // Shift "now" back so just-missed steps are included too.
    const due = upcomingReminders(
      feed.trip,
      feed.days,
      new Date(nowMs - LATE_MS),
      HORIZON_MS + LATE_MS,
    );
    const sentMap = { ...sub.sent };
    let dead = false;
    for (const r of due) {
      if (sentMap[r.id]) continue;
      const res = await sendPush(sub.endpoint, sub.keys, {
        title: r.title,
        body: r.body,
        id: r.id,
      });
      if (res === "ok") {
        sentMap[r.id] = nowMs;
        sent++;
      } else if (res === "gone") {
        await deleteSubscription(sub.endpoint);
        gone++;
        dead = true;
        break;
      } else {
        failed++;
      }
    }
    if (dead) continue;
    for (const [k, t] of Object.entries(sentMap)) {
      if (nowMs - t > SENT_TTL_MS) delete sentMap[k];
    }
    await markSent(sub.endpoint, sentMap);
  }

  return Response.json({ ok: true, subs: subs.length, sent, gone, failed });
}
