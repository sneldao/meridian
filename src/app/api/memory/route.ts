import { NextResponse } from "next/server";
import { loadMemory } from "@/domain/memory";
import { tenantOf } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const tenant = tenantOf(req);
  if (!tenant) {
    return NextResponse.json({ error: "session required" }, { status: 401 });
  }
  return NextResponse.json(await loadMemory(tenant));
}
