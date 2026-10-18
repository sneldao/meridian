// Client side of Web Push. The subscription is tied to the feed's write key
// (the device already holds it), so subscribing needs no other auth. Push is
// a bonus channel — every failure here just leaves the in-tab reminders on.
import { getFeedRef } from "@/lib/feed";

function b64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function urlB64ToUint8Array(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Subscribe this device to server-pushed reminders for the current feed.
 *  Returns false on every graceful-degradation path — no feed, no Push API,
 *  push not configured server-side — so callers never have to distinguish. */
export async function ensurePushSubscription(): Promise<boolean> {
  const ref = getFeedRef();
  if (!ref) return false;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  if (typeof window === "undefined" || !("PushManager" in window)) return false;
  try {
    const cfg = (await fetch("/api/push/subscribe").then((r) => r.json())) as {
      enabled?: boolean;
      publicKey?: string;
    };
    if (!cfg.enabled || !cfg.publicKey) return false;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(cfg.publicKey) as BufferSource,
      });
    }
    const p256dh = b64(sub.getKey("p256dh"));
    const auth = b64(sub.getKey("auth"));
    if (!p256dh || !auth) return false;
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: ref.id,
        key: ref.key,
        endpoint: sub.endpoint,
        keys: { p256dh, auth },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Tell the server to stop sending, then drop the browser subscription. */
export async function dropPushSubscription(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  } catch {
    /* ignore */
  }
}
