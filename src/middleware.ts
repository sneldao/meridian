import { NextRequest, NextResponse } from "next/server";
import { mintSessionToken, sessionCookieName, SESSION_TOKEN_RE } from "./lib/session";

const LEGACY_HEADER = "x-meridian-tid";

/** The origins a real browser writes from. Behind Cloudflare→Render,
 *  `req.nextUrl.origin` is the internal upstream host, not the public domain,
 *  so an Origin check against it rejects every browser POST (the 403 on prod,
 *  2026-11-03). The public origin(s) come from PUBLIC_ORIGIN (comma-separated);
 *  the default is the deployed domain, and the request's own origin is always
 *  allowed so local dev and direct hits keep working. */
export function publicOrigins(): string[] {
  return (process.env.PUBLIC_ORIGIN ?? "https://meridian.trustfall.xyz")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function middleware(req: NextRequest) {
  // `/?depth=operator` is a route, not a view mode — resolve it server-side
  // so the crew surface loads directly instead of hydrating Home first.
  if (req.nextUrl.searchParams.get("depth") === "operator") {
    const url = req.nextUrl.clone();
    url.pathname = "/crew";
    url.searchParams.delete("depth");
    return NextResponse.redirect(url);
  }

  const isApi = req.nextUrl.pathname.startsWith("/api/");
  if (isApi) {
    if (req.headers.get("sec-fetch-site") === "cross-site") {
      return Response.json({ error: "cross-site requests are not allowed" }, { status: 403 });
    }
    const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    const origin = req.headers.get("origin");
    if (mutating && origin) {
      let foreign = true;
      try {
        const requestOrigin = new URL(origin).origin;
        // Triple check: the request's own origin (local dev, direct hits),
        // its Host header (Cloudflare→Render preserves Host, so any domain
        // the server actually serves matches here), or the configured
        // public-origin allow-list (for upstream hops that rewrite Host).
        foreign =
          requestOrigin !== req.nextUrl.origin &&
          requestOrigin !== new URL(req.url).host &&
          new URL(requestOrigin).host !== req.nextUrl.host &&
          !publicOrigins().includes(requestOrigin);
      } catch {
        foreign = true;
      }
      if (foreign) {
        return Response.json({ error: "cross-origin writes are not allowed" }, { status: 403 });
      }
    }
  }

  const cookieName = sessionCookieName();
  const existing = req.cookies.get(cookieName)?.value;
  const token = existing && SESSION_TOKEN_RE.test(existing) ? existing : mintSessionToken();

  const headers = new Headers(req.headers);
  headers.delete(LEGACY_HEADER);
  const requestCookies = (headers.get("cookie") ?? "")
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith(`${cookieName}=`));
  requestCookies.push(`${cookieName}=${token}`);
  headers.set("cookie", requestCookies.join("; "));

  const res = NextResponse.next({ request: { headers } });
  if (token !== existing) {
    res.cookies.set(cookieName, token, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" || req.nextUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  if (isApi) {
    res.headers.set("Cache-Control", "private, no-store");
  }
  return res;
}

export const config = {
  matcher: [
    "/",
    "/api/:path*",
    "/crew",
    "/history",
    "/arrival",
    "/review",
    "/outcome",
    "/shift",
    "/team",
    "/demo",
    "/privacy",
    "/support",
    "/plan/:path*",
  ],
};
