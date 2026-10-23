import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { searchTavily, tavilyEnabled } from "../src/tools/tavily";

const SAMPLE = { results: [{ title: "A", url: "https://a.test/x", content: "snip" }] };
const SB_OK = JSON.stringify({ status: "completed", output: SAMPLE });

const KEYS = ["TAVILY_API_KEY", "SANDBASE_API_KEY", "SANDBASE_BASE_URL", "SEARCH_ROUTE_ORDER"] as const;
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

type Call = { url: string; init?: RequestInit };
const stub = (fn: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) =>
  fn as unknown as typeof fetch;
const bodyOf = (c: Call) => JSON.parse(String(c.init?.body)) as Record<string, unknown>;

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  globalThis.fetch = realFetch;
});

describe("tavily sandbase route", () => {
  it("serves native first with api_key body", async () => {
    process.env.TAVILY_API_KEY = "tv-key";
    const calls: Call[] = [];
    globalThis.fetch = stub(async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(SAMPLE), { status: 200 });
    });
    const hits = await searchTavily("q");
    expect(hits[0]?.provider).toBe("native");
    expect(calls[0].url).toBe("https://api.tavily.com/search");
    expect(bodyOf(calls[0]).api_key).toBe("tv-key");
  });

  it("falls back to sandbase and drops api_key", async () => {
    process.env.TAVILY_API_KEY = "tv-key";
    process.env.SANDBASE_API_KEY = "sb-key";
    const calls: Call[] = [];
    globalThis.fetch = stub(async (url, init) => {
      calls.push({ url: String(url), init });
      if (calls.length === 1) return new Response("x", { status: 500 });
      return new Response(SB_OK, { status: 200 });
    });
    const hits = await searchTavily("q");
    expect(hits[0]?.provider).toBe("sandbase");
    expect(calls[1].url).toBe("https://api.sandbase.ai/v1/api/tavily/search");
    const body = bodyOf(calls[1]);
    expect(body.api_key).toBeUndefined();
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe("Bearer sb-key");
  });

  it("works sandbase-only and is enabled", async () => {
    process.env.SANDBASE_API_KEY = "sb-key";
    globalThis.fetch = stub(async () => new Response(SB_OK, { status: 200 }));
    expect(tavilyEnabled()).toBe(true);
    const hits = await searchTavily("q");
    expect(hits[0]?.provider).toBe("sandbase");
  });

  it("honours SEARCH_ROUTE_ORDER=sandbase,native", async () => {
    process.env.TAVILY_API_KEY = "tv-key";
    process.env.SANDBASE_API_KEY = "sb-key";
    process.env.SEARCH_ROUTE_ORDER = "sandbase,native";
    const calls: string[] = [];
    globalThis.fetch = stub(async (url) => {
      calls.push(String(url));
      return new Response(SB_OK, { status: 200 });
    });
    await searchTavily("q");
    expect(calls[0]).toContain("api.sandbase.ai");
    expect(calls.length).toBe(1);
  });

  it("returns empty when all routes fail", async () => {
    process.env.TAVILY_API_KEY = "tv-key";
    process.env.SANDBASE_API_KEY = "sb-key";
    globalThis.fetch = stub(async () => new Response("x", { status: 500 }));
    expect(await searchTavily("q")).toEqual([]);
  });
});
