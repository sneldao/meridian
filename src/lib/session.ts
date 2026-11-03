export const SESSION_TOKEN_RE = /^[0-9a-f]{64}$/;

export function sessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Host-meridian-session"
    : "meridian-session";
}

export function mintSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function sessionTokenOf(req: Request): string | undefined {
  const name = sessionCookieName();
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const token = part.slice(eq + 1).trim();
    return SESSION_TOKEN_RE.test(token) ? token : undefined;
  }
  return undefined;
}
