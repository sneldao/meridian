import { dispatch, MCP_PROTOCOL_VERSION } from "@/mcp/server";
import { rateLimit, RL_MCP } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
// plan_shift drains a whole crew run; same ceiling as the SSE route.
export const maxDuration = 300;

/** Crew-spawning tools cost real tokens — weight them heavier in the bucket. */
const EXPENSIVE_TOOLS = new Set(["plan_shift", "preview_trip"]);

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } },
      { status: 400 },
    );
  }

  const cost =
    typeof body === "object" && body !== null && "method" in body &&
    body.method === "tools/call" &&
    EXPENSIVE_TOOLS.has(
      String((body as { params?: { name?: unknown } }).params?.name ?? ""),
    )
      ? 5
      : 1;
  const rl = rateLimit(req, "mcp", { limit: RL_MCP, windowMs: 3_600_000, cost });
  if (!rl.ok) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "rate limited" } },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const result = await dispatch(body);
  if (result === null) return new Response(null, { status: 202 });
  return Response.json(result);
}

// Streamable HTTP allows a GET SSE stream for server-initiated messages.
// Meridian never pushes — declare it with a 405 per spec.
export async function GET() {
  return Response.json(
    {
      name: "meridian",
      protocolVersion: MCP_PROTOCOL_VERSION,
      endpoint: "/api/mcp",
      transport: "streamable-http (stateless, POST only)",
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}

// No sessions are issued, so there is nothing to tear down.
export async function DELETE() {
  return new Response(null, { status: 200 });
}
