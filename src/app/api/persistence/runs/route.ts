import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listRuns, persistRun, supabaseEnabled } from "@/tools/supabase";
import { tenantOf } from "@/lib/tenant";
import { rateLimit, tooMany } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

const airportPoint = z.object({
  code: z.string().regex(/^[A-Z]{3}$/),
  name: z.string().max(120).optional(),
});

const runPayload = z.object({
  id: z.union([z.number().finite(), z.string().max(120)]).optional(),
  savedAt: z.iso.datetime(),
  trip: z
    .object({
      origin: airportPoint,
      destination: airportPoint,
      requiredShiftMin: z.number().finite(),
      direction: z.enum(["east", "west"]),
      departureDayIndex: z.number().int().min(0).max(39).optional(),
      days: z
        .array(
          z.object({
            dayIndex: z.number().int().min(0).max(39),
            label: z.string().max(200),
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          }),
        )
        .max(40)
        .optional(),
    })
    .nullable()
    .optional(),
  score: z.number().finite(),
  summary: z.string().max(2000),
  days: z
    .array(z.object({ label: z.string().max(200), shiftMin: z.number().finite() }))
    .max(40)
    .optional(),
  provider: z.string().max(80).optional(),
  fallback: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const tenant = tenantOf(req);
  if (!tenant) {
    return NextResponse.json({ error: "session required" }, { status: 401 });
  }
  if (!supabaseEnabled()) {
    return NextResponse.json({ enabled: false, runs: [] });
  }
  return NextResponse.json({ enabled: true, runs: await listRuns(20, tenant) });
}

export async function POST(req: NextRequest) {
  const tenant = tenantOf(req);
  if (!tenant) {
    return NextResponse.json({ error: "session required" }, { status: 401 });
  }
  const rl = rateLimit(req, "persistence-write", { limit: 60, windowMs: 3_600_000 });
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "body too large" }, { status: 413 });
  }
  if (!supabaseEnabled()) {
    return NextResponse.json({ enabled: false, ok: false }, { status: 503 });
  }
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "body too large" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid run payload" }, { status: 400 });
  }
  const parsed = runPayload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid run payload" }, { status: 400 });
  }
  const ok = await persistRun(parsed.data, tenant);
  return NextResponse.json({ enabled: true, ok }, { status: ok ? 200 : 500 });
}
