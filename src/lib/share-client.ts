// Client-side share delivery: the native sheet where it exists (phones —
// where most cards actually leave the app), clipboard + preview tab as the
// desktop fallback. Both ends are best-effort; a failed clipboard or a
// cancelled sheet is silent, never an error surface.

export async function shareLink(url: string, text?: string): Promise<void> {
  const full = url.startsWith("http") ? url : `${window.location.origin}${url}`;
  const nav = navigator as Navigator & {
    share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
  };
  if (nav.share) {
    try {
      await nav.share({ title: "Meridian", text, url: full });
      return;
    } catch {
      // Cancelled sheet or unsupported payload — fall to clipboard + open.
    }
  }
  try {
    await navigator.clipboard.writeText(full);
  } catch {
    /* clipboard optional */
  }
  window.open(url, "_blank");
}
