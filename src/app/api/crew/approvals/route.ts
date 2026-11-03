import { pendingCalendarApproval, resolveCalendarApproval } from "@/lib/calendar-approvals";
import { crewRun } from "@/lib/crew-runs";
import { tenantOf } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const tenant = tenantOf(req);
  if (!tenant) {
    return Response.json({ ok: false, error: "session required" }, { status: 401 });
  }
  const body = await req.json().catch(() => null) as { approvalId?: unknown; approve?: unknown } | null;
  if (typeof body?.approvalId !== "string" || typeof body.approve !== "boolean") {
    return Response.json({ ok: false, error: "approvalId and approve are required" }, { status: 400 });
  }
  const payload = pendingCalendarApproval(body.approvalId);
  const run = payload?.runId ? crewRun(payload.runId) : undefined;
  if (!run?.ownerTenant || run.ownerTenant !== tenant) {
    return Response.json({ ok: false, error: "approval not found" }, { status: 404 });
  }
  const result = await resolveCalendarApproval(body.approvalId, body.approve);
  return Response.json({ ok: result.status !== "failed", result });
}
