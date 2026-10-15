import { dispatch, MCP_PROTOCOL_VERSION } from "@/mcp/server";

export const dynamic = "force-dynamic";
// plan_shift drains a whole crew run; same ceiling as the SSE route.
export const maxDuration = 300;

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
