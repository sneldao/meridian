import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  addTasteEntity,
  isTasteEntitiesResponse,
  isTasteResponse,
  isTasteType,
  placeSearchUrl,
  tasteSelectionKey,
  type TasteEntity,
} from "../src/domain/taste";
import { createTasteRequestScope } from "../src/lib/taste-request";
import { destinationTaste, searchTasteEntities } from "../src/tools/qloo";
import { tasteResultLabel } from "../src/components/TasteDiscovery";

const KEYS = ["QLOO_API_KEY", "QLOO_BASE_URL"] as const;
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

const stub = (fn: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) =>
  fn as unknown as typeof fetch;

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  globalThis.fetch = realFetch;
});

const entities = (rows: unknown[]) => JSON.stringify({ results: { entities: rows } });

describe("domain/taste helpers", () => {
  const a: TasteEntity = { id: "b2", name: "B", type: "artist" };
  const b: TasteEntity = { id: "a1", name: "A", type: "movie" };

  it("addTasteEntity dedupes and caps at three", () => {
    const c: TasteEntity = { id: "c3", name: "C", type: "book" };
    const d: TasteEntity = { id: "d4", name: "D", type: "brand" };
    expect(addTasteEntity([a], a)).toEqual([a]);
    expect(addTasteEntity([a, b, c], d)).toEqual([a, b, c]);
    expect(addTasteEntity([a], b)).toEqual([a, b]);
  });

  it("tasteSelectionKey sorts ids", () => {
    expect(tasteSelectionKey([a, b])).toBe("a1,b2");
    expect(tasteSelectionKey([])).toBe("");
  });

  it("isTasteType guards the union", () => {
    expect(isTasteType("artist")).toBe(true);
    expect(isTasteType("podcast")).toBe(false);
  });

  it("placeSearchUrl encodes name and destination", () => {
    expect(placeSearchUrl("Café & Bar", "São Paulo")).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Café & Bar, São Paulo")}`,
    );
  });

  it("tasteResultLabel uses only the provided seeds", () => {
    expect(tasteResultLabel([])).toBe("Destination picks · not personalized yet");
    expect(tasteResultLabel([b, a])).toBe("Taste signals: A, B");
  });
});

describe("createTasteRequestScope", () => {
  it("keeps independent scopes: each begin stays current, supersede/cancel are scoped", () => {
    const search = createTasteRequestScope();
    const discover = createTasteRequestScope();

    const s1 = search.begin();
    const d1 = discover.begin();
    expect(s1.isCurrent()).toBe(true);
    expect(d1.isCurrent()).toBe(true);

    const s2 = search.begin();
    expect(s2.isCurrent()).toBe(true);
    expect(s1.isCurrent()).toBe(false);
    expect(s1.signal.aborted).toBe(true);
    expect(d1.isCurrent()).toBe(true);
    expect(d1.signal.aborted).toBe(false);

    discover.cancel();
    expect(d1.isCurrent()).toBe(false);
    expect(d1.signal.aborted).toBe(true);
    expect(s2.isCurrent()).toBe(true);
    expect(s2.signal.aborted).toBe(false);

    search.cancel();
    expect(s2.isCurrent()).toBe(false);
    expect(s2.signal.aborted).toBe(true);
  });
});

describe("taste response validators", () => {
  const base = { enabled: true, destination: "Lisbon", places: [{ name: "Spot", categories: ["coffee"] }] };

  it("accepts honest shapes", () => {
    expect(isTasteResponse(base)).toBe(true);
    expect(isTasteResponse({ enabled: false, destination: null, places: [] })).toBe(true);
    expect(isTasteResponse({ ...base, note: "unavailable" })).toBe(true);
  });

  it("rejects malformed rows instead of leaking them to the UI", () => {
    expect(isTasteResponse({ ...base, places: [{ name: "Spot", categories: [42] }] })).toBe(false);
    expect(isTasteResponse({ ...base, places: [{ name: "Spot" }] })).toBe(false);
    expect(isTasteResponse({ ...base, destination: 42 })).toBe(false);
    expect(isTasteResponse({ ...base, places: [null, { name: "Spot", categories: [] }] })).toBe(false);
    expect(isTasteResponse({ ...base, note: { why: "x" } })).toBe(false);
    expect(isTasteResponse({ enabled: "yes", destination: "Lisbon", places: [] })).toBe(false);
    expect(isTasteResponse(null)).toBe(false);
  });

  it("search entities must carry a submittable id and a real name", () => {
    const ok = { enabled: true, entities: [{ id: "urn:e:1", name: "Phoebe" }] };
    expect(isTasteEntitiesResponse(ok)).toBe(true);
    expect(isTasteEntitiesResponse({ enabled: true, entities: [{ id: "bad id", name: "X" }] })).toBe(false);
    expect(isTasteEntitiesResponse({ enabled: true, entities: [{ id: "e1", name: "  " }] })).toBe(false);
    expect(isTasteEntitiesResponse({ enabled: true, entities: [{ id: "", name: "X" }] })).toBe(false);
    expect(isTasteEntitiesResponse({ enabled: true, entities: [{ id: 7, name: "X" }] })).toBe(false);
  });
});

describe("searchTasteEntities", () => {
  it("sends /search with the requested type and exact query, deduping rows", async () => {
    process.env.QLOO_API_KEY = "qk";
    const calls: string[] = [];
    globalThis.fetch = stub(async (url) => {
      calls.push(String(url));
      return new Response(
        entities([
          { entity_id: "e1", name: "  Phoebe Bridgers " },
          { entity_id: "e1", name: "Phoebe Bridgers" },
          { entity_id: "", name: "No id" },
          { name: "No id field" },
          { entity_id: "e2", name: "   " },
          null,
          "garbage",
          { entity_id: "e2", name: "Punisher" },
        ]),
        { status: 200 },
      );
    });
    const out = await searchTasteEntities("phoebe", "artist");
    expect(out).toEqual([
      { id: "e1", name: "Phoebe Bridgers", type: "artist" },
      { id: "e2", name: "Punisher", type: "artist" },
    ]);
    globalThis.fetch = stub(async () =>
      new Response(
        entities([
          { entity_id: "bad id", name: "No regex" },
          { entity_id: "ok1", name: "x".repeat(101) },
          { entity_id: "ok2", name: "Fine" },
        ]),
        { status: 200 },
      ),
    );
    expect(await searchTasteEntities("q", "artist")).toEqual([{ id: "ok2", name: "Fine", type: "artist" }]);
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("/search?");
    expect(calls[0]).toContain("query=phoebe");
    expect(calls[0]).toContain("types=urn%3Aentity%3Aartist");
  });

  it("returns empty without a key", async () => {
    globalThis.fetch = stub(async () => { throw new Error("must not fetch"); });
    expect(await searchTasteEntities("x", "movie")).toEqual([]);
  });
});

describe("destinationTaste", () => {
  it("sends selected interest ids on the locality call and WKT fallback, skipping destination search", async () => {
    process.env.QLOO_API_KEY = "qk";
    const calls: string[] = [];
    globalThis.fetch = stub(async (url) => {
      calls.push(String(url));
      if (calls.length === 1) return new Response(entities([]), { status: 200 });
      return new Response(entities([{ name: "Venue", properties: { keywords: [{ name: "coffee" }] } }]), { status: 200 });
    });
    const out = await destinationTaste("Lisbon", -9.14, 38.72, ["id:a", "id:b"]);
    expect(calls.every((c) => !c.includes("/search"))).toBe(true);
    expect(calls.length).toBe(2);
    expect(calls[0]).toContain("signal.interests.entities=id%3Aa%2Cid%3Ab");
    expect(calls[0]).toContain("filter.location.query=Lisbon");
    expect(calls[1]).toContain("filter.location=POINT%28");
    expect(calls[1]).toContain("signal.interests.entities=id%3Aa%2Cid%3Ab");
    expect(out.places).toEqual([{ name: "Venue", categories: ["coffee"], daytimeCandidate: false }]);
  });

  it("without interests it searches the destination and seeds with its entity id", async () => {
    process.env.QLOO_API_KEY = "qk";
    const calls: string[] = [];
    globalThis.fetch = stub(async (url) => {
      calls.push(String(url));
      if (calls.length === 1) {
        return new Response(entities([{ entity_id: "dest1", name: "Tokyo" }]), { status: 200 });
      }
      return new Response(entities([{ name: "Shibuya Cafe" }]), { status: 200 });
    });
    const out = await destinationTaste("Tokyo", 139.7, 35.7);
    expect(calls[0]).toContain("/search");
    expect(calls[1]).toContain("signal.interests.entities=dest1");
    expect(out.destination).toBe("Tokyo");
  });

  it("rejects on upstream non-ok", async () => {
    process.env.QLOO_API_KEY = "qk";
    globalThis.fetch = stub(async () => new Response("x", { status: 500 }));
    await expect(searchTasteEntities("q", "artist")).rejects.toThrow("Taste service unavailable");
  });

  it("drops non-string names and malformed categories before reaching the UI", async () => {
    process.env.QLOO_API_KEY = "qk";
    globalThis.fetch = stub(async (url) => {
      const u = String(url);
      if (u.includes("/search")) return new Response(entities([{ entity_id: "d", name: "Rome" }]), { status: 200 });
      return new Response(
        entities([
          { name: 42 },
          { name: "Real Place", properties: { keywords: [{ name: 7 }, { name: "  " }, null, { name: "park" }] } },
        ]),
        { status: 200 },
      );
    });
    const out = await destinationTaste("Rome", 12.5, 41.9);
    expect(out.places).toEqual([{ name: "Real Place", categories: ["park"], daytimeCandidate: false }]);
  });

  it("a locality that returns only unusable rows still triggers the WKT fallback", async () => {
    process.env.QLOO_API_KEY = "qk";
    const calls: string[] = [];
    globalThis.fetch = stub(async (url) => {
      calls.push(String(url));
      if (calls.length === 1) return new Response(entities([{ entity_id: "d", name: "Rome" }]), { status: 200 });
      if (calls.length === 2) return new Response(entities([{ name: "" }, null]), { status: 200 });
      return new Response(entities([{ name: "Fallback Spot" }]), { status: 200 });
    });
    const out = await destinationTaste("Rome", 12.5, 41.9);
    expect(calls.length).toBe(3);
    expect(calls[2]).toContain("filter.location=POINT%28");
    expect(out.places[0].name).toBe("Fallback Spot");
  });

  it("filters blank and duplicate place names", async () => {
    process.env.QLOO_API_KEY = "qk";
    globalThis.fetch = stub(async (url) => {
      const u = String(url);
      if (u.includes("/search")) return new Response(entities([{ entity_id: "d", name: "Rome" }]), { status: 200 });
      return new Response(
        entities([
          { name: "Trastevere Walk" },
          { name: "Trastevere Walk" },
          { name: "  " },
          { properties: { keywords: "not-an-array" } },
          { name: "Villa Ada", properties: { keywords: "nope" } },
        ]),
        { status: 200 },
      );
    });
    const out = await destinationTaste("Rome", 12.5, 41.9);
    expect(out.places.map((p) => p.name)).toEqual(["Trastevere Walk", "Villa Ada"]);
    expect(out.places[1].categories).toEqual([]);
  });
});

const { GET: tasteGET } = await import("../src/app/api/taste/route");
const { GET: searchGET } = await import("../src/app/api/taste/search/route");

describe("toPlace taxonomy + daytime curation (frozen capture)", () => {
  let n = 0;
  const ent = (over: Record<string, unknown>) => ({
    entity_id: `C293106E-AAAA-4000-8000-0000000000${String(++n).padStart(2, "0")}`,
    name: "Place",
    ...over,
  });
  const tags = (...names: [string, string][]) =>
    names.map(([type, name]) => ({ type, name }));

  it("structured category tags win over vague keywords and drive daytimeCandidate", async () => {
    process.env.QLOO_API_KEY = "qk";
    globalThis.fetch = stub(async (url) => {
      const u = String(url);
      if (u.includes("/search")) return new Response(entities([{ entity_id: "d1", name: "Tokyo" }]), { status: 200 });
      return new Response(
        entities([
          ent({ name: "Cathedral", tags: tags(["urn:tag:category:place", "Catholic Cathedral"], ["urn:tag:other", "Romantic"]) , properties: { keywords: [{ name: "vague kw" }] } }),
          ent({ name: "Gallery", tags: tags(["urn:tag:category:place", "Art Gallery"]) }),
          ent({ name: "Hotel", tags: tags(["urn:tag:category:place", "Hotel"]) }),
          ent({ name: "School", tags: tags(["urn:tag:category:place", "School"]) }),
          ent({ name: "Bar", tags: tags(["urn:tag:category:place", "Bar"]) }),
          ent({ name: "AttractionOnly", tags: tags(["urn:tag:category:place", "Tourist Attraction"]) }),
          ent({ name: "Closed Cafe", tags: tags(["urn:tag:category:place", "Cafe"]), properties: { is_closed: true } }),
          ent({ name: "Tagless", properties: { keywords: [{ name: "nice spot" }] } }),
        ]),
        { status: 200 },
      );
    });
    const out = await destinationTaste("Tokyo", 139.7, 35.7);
    const by = (n: string) => out.places.find((p) => p.name === n)!;
    expect(by("Cathedral").categories[0]).toBe("Catholic Cathedral");
    expect(by("Cathedral").categories).not.toContain("Romantic");
    expect(by("Cathedral").daytimeCandidate).toBe(true);
    expect(by("Gallery").daytimeCandidate).toBe(true);
    expect(by("Hotel").daytimeCandidate).toBe(false);
    expect(by("School").daytimeCandidate).toBe(false);
    expect(by("Bar").daytimeCandidate).toBe(false);
    expect(by("AttractionOnly").daytimeCandidate).toBe(false);
    expect(by("Closed Cafe").daytimeCandidate).toBe(false);
    expect(by("Tagless").daytimeCandidate).toBe(false);
    expect(by("Tagless").categories).toEqual(["nice spot"]);
    expect(by("Cathedral").id).toBe("C293106E-AAAA-4000-8000-000000000001");
  });
});

describe("GET /api/taste", () => {
  const GET = tasteGET;
  let n = 0;
  const req = (qs: string) =>
    new Request(`https://x.test/api/taste?${qs}`, {
      headers: { "x-forwarded-for": `10.0.0.${++n}` },
    });

  it("is disabled without a key", async () => {
    globalThis.fetch = stub(async () => { throw new Error("must not fetch"); });
    const res = await GET(req("city=Tokyo&lon=139.7&lat=35.7"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false, destination: null, places: [] });
  });

  it("rejects invalid params without fetching upstream", async () => {
    process.env.QLOO_API_KEY = "qk";
    let fetched = 0;
    globalThis.fetch = stub(async () => { fetched++; return new Response(entities([]), { status: 200 }); });
    for (const bad of [
      "city=",
      "city=T&lon=&lat=35",
      "city=T&lon=200&lat=35",
      "city=T&lon=139&lat=-91",
      "city=T&lon=139&lat=35&interests=",
      "city=T&lon=139&lat=35&interests=a,,b",
      "city=T&lon=139&lat=35&interests=a,b,c,d",
      "city=T&lon=139&lat=35&interests=bad%20id",
    ]) {
      const res = await GET(req(bad));
      expect(res.status).toBe(400);
    }
    expect(fetched).toBe(0);
  });

  it("propagates selected interest ids upstream", async () => {
    process.env.QLOO_API_KEY = "qk";
    const calls: string[] = [];
    globalThis.fetch = stub(async (url) => {
      calls.push(String(url));
      return new Response(entities([{ name: "Spot" }]), { status: 200 });
    });
    const res = await GET(req("city=Rome&lon=12.5&lat=41.9&interests=z2,a1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(calls[0]).toContain("signal.interests.entities=z2%2Ca1");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("returns 502 with an honest error on upstream failure", async () => {
    process.env.QLOO_API_KEY = "qk";
    globalThis.fetch = stub(async () => new Response("x", { status: 503 }));
    const res = await GET(req("city=Rome&lon=12.5&lat=41.9"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.places).toEqual([]);
    expect(body.error).toContain("unavailable");
  });
});

describe("GET /api/taste/search", () => {
  const GET = searchGET;
  let n = 0;
  const req = (qs: string) =>
    new Request(`https://x.test/api/taste/search?${qs}`, {
      headers: { "x-forwarded-for": `10.1.0.${++n}` },
    });

  it("rejects invalid q and type without fetching", async () => {
    process.env.QLOO_API_KEY = "qk";
    let fetched = 0;
    globalThis.fetch = stub(async () => { fetched++; return new Response(entities([]), { status: 200 }); });
    for (const bad of ["q=x&type=artist", "q=ok&type=podcast", "type=artist", "q=&type=book"]) {
      const res = await GET(req(bad));
      expect(res.status).toBe(400);
    }
    expect(fetched).toBe(0);
  });

  it("is disabled without a key", async () => {
    globalThis.fetch = stub(async () => { throw new Error("must not fetch"); });
    const res = await GET(req("q=phoebe&type=artist"));
    expect(await res.json()).toEqual({ enabled: false, entities: [] });
  });

  it("returns entities on success", async () => {
    process.env.QLOO_API_KEY = "qk";
    globalThis.fetch = stub(async () =>
      new Response(entities([{ entity_id: "e1", name: "Phoebe" }]), { status: 200 }),
    );
    const res = await GET(req("q=phoebe&type=artist"));
    const body = await res.json();
    expect(body.entities).toEqual([{ id: "e1", name: "Phoebe", type: "artist" }]);
  });

  it("returns 502 with an honest error on upstream failure", async () => {
    process.env.QLOO_API_KEY = "qk";
    globalThis.fetch = stub(async () => new Response("x", { status: 503 }));
    const res = await GET(req("q=phoebe&type=artist"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.entities).toEqual([]);
    expect(body.error).toContain("unavailable");
  });

  it("rate limits at 30/min per IP with Retry-After, before any upstream call", async () => {
    let fetched = 0;
    globalThis.fetch = stub(async () => { fetched++; return new Response(entities([]), { status: 200 }); });
    const ipReq = () =>
      new Request("https://x.test/api/taste/search?q=phoebe&type=artist", {
        headers: { "x-forwarded-for": "203.0.113.77" },
      });
    let last: Response | null = null;
    for (let i = 0; i < 30; i++) last = await GET(ipReq());
    expect(last!.status).toBe(200);
    const limited = await GET(ipReq());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect((await limited.json()).error).toContain("Too many requests");
    expect(fetched).toBe(0);
  });
});
