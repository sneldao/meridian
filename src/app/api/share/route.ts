// Shareable cards: POST a briefing (plan card) or an arrival receipt, get a
// /plan/{id} link. Durable in Supabase (meridian_shares) when configured,
// filesystem fallback otherwise — replay mode needs zero services.
// Writer/reader live in src/lib/share.ts (route files can't export helpers).
import { saveSharedPlan } from "@/lib/share";

const RECEIPT_KEYS = [
  "hoursOff",
  "deliveredHours",
  "claimedHours",
  "requiredHours",
  "baselineHours",
] as const;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const b = body?.briefing;
  const a = body?.arrival;
  const briefingOk = b && typeof b.summary === "string" && Array.isArray(b.days);
  const arrivalOk =
    a &&
    RECEIPT_KEYS.every((k) => typeof a[k] === "number") &&
    a.requiredHours > 0;
  if (!briefingOk && !arrivalOk) {
    return Response.json(
      { error: "expected {briefing:{summary,days}} or {arrival:{receipt numbers}}" },
      { status: 400 },
    );
  }
  const id = await saveSharedPlan({
    briefing: briefingOk ? b : null,
    trip: body.trip ?? null,
    arrival: arrivalOk ? a : null,
  });
  return Response.json({ id, url: `/plan/${id}` });
}
