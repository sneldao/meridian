import { NextResponse } from "next/server";
import { loadMemory } from "@/domain/memory";
import { tenantOf } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return NextResponse.json(await loadMemory(tenantOf(req)));
}