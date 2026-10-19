"use client";

import { useEffect } from "react";

// The last resort: this catches throws from the root layout itself, which
// means the normal <html>/<body> are gone and Next requires this boundary to
// render them. It is styled inline because globals.css may be exactly what
// failed to load.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Meridian fatal error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#F5EFE6",
          color: "#1E1B18",
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        }}
      >
        <main style={{ maxWidth: 460, padding: 24, textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.2em",
              color: "#D96B43",
            }}
          >
            MERIDIAN
          </p>
          <h1 style={{ fontSize: 26, lineHeight: 1.15, margin: "12px 0 10px" }}>
            We couldn&apos;t start.
          </h1>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "#5b4d41", margin: "0 0 20px" }}>
            Something failed before this page could load. Nothing has been lost —
            your trip and your progress are saved on this device.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              font: "inherit",
              fontSize: 13,
              fontWeight: 800,
              background: "#D96B43",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "11px 24px",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ fontSize: 11, color: "#7a6a5c", marginTop: 18 }}>
              Reference <code>{error.digest}</code>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}