"use client";

import { useEffect, useState } from "react";

export function OfflineBadge() {
  const [offline, setOffline] = useState(false);
  const [cruising, setCruising] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const t = setTimeout(() => {
      try { setCruising(localStorage.getItem("meridian:inflight") === "1"); } catch {}
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const toggleCruising = () => {
    const next = !cruising;
    setCruising(next);
    try { localStorage.setItem("meridian:inflight", next ? "1" : "0"); } catch {}
  };
  if (!offline && !cruising) return null;
  return (
    <div role="status" aria-live="polite" className="offline-badge">
      {offline ? "Offline — plan saved on this device" : "In-flight mode"}
      <button type="button" className="offline-toggle" onClick={toggleCruising}>
        {cruising ? "Exit cruising" : "✈ Cruising"}
      </button>
      {cruising && (
        <span className="offline-hint">Dim cabin lights, hydrate, and sleep to destination night.</span>
      )}
    </div>
  );
}

