// Minimal IP rate limit for the expensive public surfaces. In-memory token
// bucket keyed by x-forwarded-for — good enough for a single-instance demo
// service (Render web); on serverless it would degrade to best-effort.
// Env overrides for judging: MERIDIAN_RL_RUNS (crew runs/IP/hour),
// MERIDIAN_RL_MCP (MCP calls/IP/hour).

const buckets = new Map<string, { tokens: number; resetAt: number }>();

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

export function rateLimit(
  req: Request,
  key: string,
  { limit, windowMs, cost = 1 }: { limit: number; windowMs: number; cost?: number },
): { ok: true } | { ok: false; retryAfterSec: number } {
  const k = `${key}:${clientIp(req)}`;
  const now = Date.now();
  let b = buckets.get(k);
  if (!b || now > b.resetAt) b = { tokens: limit, resetAt: now + windowMs };
  buckets.set(k, b);
  // keep the map bounded under churn
  if (buckets.size > 5000) {
    for (const [bk, bv] of buckets) if (now > bv.resetAt) buckets.delete(bk);
  }
  if (b.tokens < cost) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.tokens -= cost;
  return { ok: true };
}

export function tooMany(retryAfterSec: number): Response {
  return Response.json(
    { error: "rate limited — the demo crew can only fly so often", retryAfterSec },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

export const RL_RUNS = Number(process.env.MERIDIAN_RL_RUNS ?? 10); // full crew runs / IP / hour
export const RL_MCP = Number(process.env.MERIDIAN_RL_MCP ?? 30); // mcp calls / IP / hour
