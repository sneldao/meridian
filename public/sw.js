const CACHE = "meridian-v3";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/", "/offline.html"])));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
  }
});

// Server-pushed reminders (Web Push). Payload: { title, body, id } — the id
// is the nudge id so the tap can mark it done/skipped like a local reminder.
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = {}; }
  event.waitUntil(
    self.registration.showNotification(d.title || "Meridian", {
      body: d.body || "Your next step is here.",
      tag: d.id,
      actions: [
        { action: "done", title: "Done" },
        { action: "skip", title: "Skip" },
      ],
      data: { id: d.id },
    }),
  );
});

// Reminder taps: Done/Skip mark the step on an open Meridian window if there
// is one, else open the app with the mark in the URL.
self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  n.close();
  const id = n.data && n.data.id;
  const status = event.action === "done" ? "done" : event.action === "skip" ? "skipped" : null;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const client = list.find((c) => "focus" in c);
      if (client) {
        if (id && status) client.postMessage({ type: "meridian-mark", id, status });
        return client.focus();
      }
      const url = id && status ? `/?mark=${id}&status=${status}` : "/";
      return self.clients.openWindow(url);
    }),
  );
});
