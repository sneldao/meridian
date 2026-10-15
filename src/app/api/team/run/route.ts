import { runReplay } from "@/agents/replay";
import { TEAM_TRAVELLERS, teamTrip } from "@/domain/team";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// One stream for the whole team. Every traveller's replay runs concurrently and
// each event is tagged with its traveller id. A single stream stays under the
// browser's six-connections-per-host limit.

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true; // client went away; stop writing
        }
      };

      await Promise.all(
        TEAM_TRAVELLERS.map(async (t) => {
          try {
            for await (const event of runReplay(teamTrip(t))) {
              send({ traveller: t.id, event });
            }
          } catch (err) {
            send({
              traveller: t.id,
              event: {
                type: "error",
                message: err instanceof Error ? err.message : "replay failed",
                recoverable: false,
              },
            });
          }
        }),
      );

      send({ traveller: null, event: { type: "done" } });
      if (!closed) controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
