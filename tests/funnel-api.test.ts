import { describe, expect, it } from "bun:test";
import { POST } from "../src/app/api/funnel/route";
import { FUNNEL_STAGES } from "../src/lib/funnel";

/* /api/funnel — the server half of the round-17 funnel. Without Supabase it
 * must no-op honestly (204, never a 500); with one it writes a row. The
 * stage vocabulary is the locked five, and the endpoint is rate limited. */

const req = (body: unknown) =>
  new Request("http://localhost/api/funnel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/funnel", () => {
  it("accepts every locked stage and no-ops honestly without Supabase", async () => {
    for (const stage of FUNNEL_STAGES) {
      const res = await POST(
        req({ stage, trip: "LHR-SIN-2026-11-04", at: "2026-11-01T09:00:00Z" }),
      );
      expect(res.status).toBe(204);
    }
  });

  it("accepts a null trip key (stages recorded before a route exists)", async () => {
    const res = await POST(req({ stage: "entry", trip: null }));
    expect(res.status).toBe(204);
  });

  it("rejects stages outside the vocabulary", async () => {
    expect((await POST(req({ stage: "launch" }))).status).toBe(400);
    expect((await POST(req({}))).status).toBe(400);
  });

  it("rejects a malformed body", async () => {
    const res = await POST(
      new Request("http://localhost/api/funnel", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an oversized trip key", async () => {
    const res = await POST(req({ stage: "entry", trip: "X".repeat(65) }));
    expect(res.status).toBe(400);
  });

  it("rate limits a flood of events", async () => {
    // The limiter shares state with the tests above, so just keep knocking
    // until the door closes — it must, within the budget.
    let limited = false;
    for (let i = 0; i < 200 && !limited; i++) {
      const res = await POST(req({ stage: "entry", trip: `T-${i}` }));
      limited = res.status === 429;
    }
    expect(limited).toBe(true);
  });
});
