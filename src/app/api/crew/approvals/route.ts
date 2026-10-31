import { resolveCalendarApproval } from "@/lib/calendar-approvals";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { approvalId?: string; approve?: boolean } | null;
  if (!body?.approvalId || typeof body.approve !== "boolean") {
    return Response.json({ ok: false, error: "approvalId and approve are required" }, { status: 400 });
  }
  const result = await resolveCalendarApproval(body.approvalId, body.approve);
  return Response.json({ ok: result.status !== "failed", result });
}
