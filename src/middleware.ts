import { NextRequest, NextResponse } from "next/server";

// Stamps a per-visitor traveller id so check-ins, memory, and graph writes
// scope to the person actually on the app — not one global profile. The id
// rides in as a request header so route handlers read it without cookies.

const COOKIE = "meridian-tid";
const HEADER = "x-meridian-tid";

export function middleware(req: NextRequest) {
  // `/?depth=operator` is a route, not a view mode — resolve it server-side
  // so the crew surface loads directly instead of hydrating Home first.
  if (req.nextUrl.searchParams.get("depth") === "operator") {
    const url = req.nextUrl.clone();
    url.pathname = "/crew";
    url.searchParams.delete("depth");
    return NextResponse.redirect(url);
  }
  const existing = req.cookies.get(COOKIE)?.value;
  const tid = existing ?? crypto.randomUUID();
  const headers = new Headers(req.headers);
  headers.set(HEADER, tid);
  const res = NextResponse.next({ request: { headers } });
  if (!existing) {
    res.cookies.set(COOKIE, tid, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  return res;
}

export const config = { matcher: ["/api/:path*", "/"] };
