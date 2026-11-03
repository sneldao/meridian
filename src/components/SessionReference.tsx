"use client";

import { useEffect, useState } from "react";

export function SessionReference() {
  const [reference, setReference] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && typeof d?.reference === "string") setReference(d.reference);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!reference) return null;
  return (
    <p className="session-reference">
      Support reference{" "}
      <code>{reference}</code>{" "}
      <button
        type="button"
        className="text-xs text-clay-2 hover:text-clay"
        onClick={() => {
          navigator.clipboard?.writeText(reference).then(() => setCopied(true)).catch(() => {});
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </p>
  );
}
