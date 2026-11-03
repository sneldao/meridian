import { NextResponse } from "next/server";
import { tenantOf } from "@/lib/tenant";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { reportError } from "@/lib/error-reporting";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024;

export async function POST(req: Request) {
  const tenant = tenantOf(req);
  if (!tenant) {
    return NextResponse.json({ error: "session required" }, { status: 401 });
  }
  const rl = rateLimit(req, "errors", { limit: 10, windowMs: 60_000 });
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "body too large" }, { status: 413 });
  }
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "body too large" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(text || "{}");
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : null;
  if (!keys || keys.some((k) => k !== "digest")) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const digest = (body as { digest?: unknown }).digest;
  if (digest !== undefined && (typeof digest !== "string" || !/^\d{1,20}$/.test(digest))) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  reportError({ source: "client", method: "POST", routePath: "/client", digest });
  return new NextResponse(null, { status: 204 });
}
