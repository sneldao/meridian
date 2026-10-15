import { NextResponse } from "next/server";
import { loadMemory } from "@/domain/memory";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadMemory());
}