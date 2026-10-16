// Shareable plan cards: POST a briefing, get a /plan/{id} link. Artifacts on
// disk (demo-grade — Render's FS is ephemeral; graduate to Supabase rows in P2).
// Reader lives in src/lib/share.ts (route files can't export helpers).
import { randomBytes } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const b = body?.briefing;
  if (!b || typeof b.summary !== "string" || !Array.isArray(b.days)) {
    return Response.json({ error: "expected {briefing: {summary, days, ...}}" }, { status: 400 });
  }
  const id = randomBytes(5).toString("hex"); // unguessable enough for a demo
  mkdirSync(path.join(process.cwd(), "artifacts", "share"), { recursive: true });
  writeFileSync(
    path.join(process.cwd(), "artifacts", "share", `${id}.json`),
    JSON.stringify({ briefing: b, trip: body.trip ?? null, sharedAt: new Date().toISOString() }),
  );
  return Response.json({ id, url: `/plan/${id}` });
}
