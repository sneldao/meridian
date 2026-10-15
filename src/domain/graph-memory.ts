/* eslint-disable @typescript-eslint/no-explicit-any */

// Optional FalkorDB-backed memory for the Graph Hacks track.
// Disabled unless FALKORDB_URL is set; the runtime then falls back to
// crew-memory.json. The agent never composes Cypher — these are the fixed
// tools behind the catalogue.

import { FalkorDB } from "falkordb";

let clientPromise: Promise<any> | null = null;

export function graphEnabled(): boolean {
  return Boolean(process.env.FALKORDB_URL);
}

export function graphId(tenant?: string): string {
  if (tenant) return `meridian:${tenant}`;
  return process.env.MERIDIAN_GRAPH_ID ?? "meridian:demo";
}

async function client(): Promise<any | null> {
  if (!graphEnabled()) return null;
  try {
    if (!clientPromise) {
      clientPromise = (FalkorDB as any).connect({ url: process.env.FALKORDB_URL });
    }
    return await clientPromise;
  } catch {
    clientPromise = null;
    return null;
  }
}

export async function graph(tenant?: string): Promise<any | null> {
  const c = await client();
  if (!c) return null;
  return c.selectGraph(graphId(tenant));
}

export interface GraphMemory {
  enabled: boolean;
  findings: { text: string; at: number; session: string; target?: string }[];
  failures: { kind: string; status: string; text?: string; at: number }[];
}

export async function loadGraphMemory(tenant?: string): Promise<GraphMemory> {
  const g = await graph(tenant);
  if (!g) return { enabled: false, findings: [], failures: [] };
  try {
    const findingsReply = await g.roQuery(
      "MATCH (f:Finding)-[:ABOUT]->(x) RETURN f.text AS text, f.at AS at, f.session AS session, coalesce(x.name, x.label, 'unknown') AS target ORDER BY f.at DESC LIMIT 8",
    );
    const failuresReply = await g.roQuery(
      "MATCH (c:CheckIn)-[:ABOUT]->(i:Intervention) WHERE c.status IN ['skipped','harder','partial'] RETURN i.kind AS kind, c.status AS status, c.text AS text, c.at AS at ORDER BY c.at DESC LIMIT 8",
    );
    return {
      enabled: true,
      findings: (findingsReply?.data ?? []).map((r: any) => ({
        text: String(r.text ?? ""),
        at: Number(r.at ?? 0),
        session: String(r.session ?? ""),
        target: r.target ? String(r.target) : undefined,
      })),
      failures: (failuresReply?.data ?? []).map((r: any) => ({
        kind: String(r.kind ?? "unknown"),
        status: String(r.status ?? "unknown"),
        text: r.text ? String(r.text) : undefined,
        at: Number(r.at ?? 0),
      })),
    };
  } catch {
    return { enabled: true, findings: [], failures: [] };
  }
}

export async function recordFinding(text: string, target = "meridian", session?: string, tenant?: string): Promise<void> {
  const g = await graph(tenant);
  if (!g) return;
  const at = Date.now();
  const sess = session ?? graphSession();
  try {
    // Attach to the real entity when the target resolves; otherwise mint a
    // Subject so the finding is never lost.
    const entity = await resolveEntity(target, tenant);
    if (entity) {
      await g.query(
        `MATCH (x) WHERE toLower(coalesce(x.name, x.label, x.kind, x.title, x.id, '')) = toLower($key)
         CREATE (f:Finding {text:$text, at:$at, session:$session})
         CREATE (f)-[:ABOUT]->(x)`,
        { params: { key: entity.key, text: text.slice(0, 280), at, session: sess } },
      );
    } else {
      await g.query(
        "MERGE (x:Subject {name:$target}) CREATE (f:Finding {text:$text, at:$at, session:$session}) CREATE (f)-[:ABOUT]->(x)",
        { params: { target, text: text.slice(0, 280), at, session: sess } },
      );
    }
  } catch {
    // Best-effort: graph memory must never break the run.
  }
}

export function graphMemoryBrief(mem: GraphMemory): string {
  if (!mem.enabled) return "Graph memory disabled (set FALKORDB_URL).";
  const bits: string[] = [];
  if (mem.findings.length) {
    bits.push(`Graph findings: ${mem.findings.map((f) => `"${f.text}"`).join("; ")}.`);
  }
  if (mem.failures.length) {
    bits.push(`Graph failures: ${mem.failures.map((f) => `${f.kind} (${f.status})`).join(", ")}.`);
  }
  return bits.length ? bits.join(" ") : "Graph memory enabled, no findings yet.";
}

// --- Fixed tool catalogue ----------------------------------------------------
// The crew's only interface to the graph. Agents never see Cypher: they call
// these, each returns the hop path it traversed, and an empty traversal says
// "not in graph" instead of inviting a guess.

export interface GraphQueryResult {
  /** Whether the queried entity/rows were found. */
  found: boolean;
  rows: number;
  /** Wall-clock ms the Cypher took — surfaced in the tool_call trace. */
  ms: number;
  /** Human-readable hop path, e.g. "CheckIn -[:ABOUT]-> Intervention". */
  path: string;
  items: Record<string, unknown>[];
  /** Set when found=false — the honest "not in graph" answer. */
  note?: string;
}

export function graphSession(): string {
  return process.env.MERIDIAN_SESSION ?? "run-2";
}

function offline(): GraphQueryResult {
  return { found: false, rows: 0, ms: 0, path: "", items: [], note: "graph memory offline" };
}

function notInGraph(what: string): GraphQueryResult {
  return { found: false, rows: 0, ms: 0, path: "", items: [], note: `${what} is not in the graph` };
}

/** Entity resolution: any node whose name/label/kind/title/id loosely matches.
 *  Every tool resolves names through this before traversing — the plan's rule
 *  that no name is reasoned about unless the graph knows it. */
export async function resolveEntity(name: string, tenant?: string): Promise<Record<string, unknown> | null> {
  const g = await graph(tenant);
  if (!g) return null;
  try {
    const res = await g.roQuery(
      `MATCH (x)
       WHERE toLower(coalesce(x.name, x.label, x.kind, x.title, x.id, '')) CONTAINS toLower($q)
       RETURN labels(x)[0] AS label, coalesce(x.name, x.label, x.kind, x.title, x.id) AS key
       LIMIT 1`,
      { params: { q: name } },
    );
    const row = res?.data?.[0];
    return row ? { label: String(row.label ?? ""), key: String(row.key ?? "") } : null;
  } catch {
    return null;
  }
}

/** Findings about a named thing: resolves the name, then walks ABOUT edges. */
export async function recallFindings(target: string, limit = 5, tenant?: string): Promise<GraphQueryResult> {
  const g = await graph(tenant);
  if (!g) return offline();
  const t0 = Date.now();
  try {
    const entity = await resolveEntity(target, tenant);
    if (!entity) return notInGraph(target);
    const res = await g.roQuery(
      `MATCH (f:Finding)-[:ABOUT]->(x)
       WHERE toLower(coalesce(x.name, x.label, x.kind, x.title, x.id, '')) = toLower($key)
       RETURN f.text AS text, f.at AS at, f.session AS session
       ORDER BY f.at DESC LIMIT $limit`,
      { params: { key: entity.key, limit } },
    );
    const items = (res?.data ?? []).map((r: any) => ({
      text: String(r.text ?? ""),
      at: Number(r.at ?? 0),
      session: String(r.session ?? ""),
    }));
    return {
      found: items.length > 0,
      rows: items.length,
      ms: Date.now() - t0,
      path: `Finding -[:ABOUT]-> ${entity.label}:${entity.key}`,
      items,
      ...(items.length ? {} : { note: `no findings recorded about ${entity.key}` }),
    };
  } catch {
    return offline();
  }
}

/** Past skipped/harder check-ins for an intervention kind, walked back to the
 *  day and trip they belong to — the multi-hop read a JSON blob can't do. */
export async function priorFailures(kind: string, limit = 5, tenant?: string): Promise<GraphQueryResult> {
  const g = await graph(tenant);
  if (!g) return offline();
  const t0 = Date.now();
  try {
    const res = await g.roQuery(
      `MATCH (c:CheckIn)-[:ABOUT]->(i:Intervention {kind:$kind})<-[:HAS_INTERVENTION]-(d:Day)<-[:INCLUDES]-(t:Trip)
       WHERE c.status IN ['skipped','harder','partial']
       RETURN c.status AS status, c.text AS text, c.at AS at, c.session AS session,
              i.label AS intervention, d.label AS day, t.label AS trip
       ORDER BY c.at DESC LIMIT $limit`,
      { params: { kind, limit } },
    );
    const items = (res?.data ?? []).map((r: any) => ({
      status: String(r.status ?? ""),
      text: r.text ? String(r.text) : undefined,
      at: Number(r.at ?? 0),
      session: String(r.session ?? ""),
      intervention: String(r.intervention ?? kind),
      day: String(r.day ?? ""),
      trip: String(r.trip ?? ""),
    }));
    return {
      found: items.length > 0,
      rows: items.length,
      ms: Date.now() - t0,
      path: `CheckIn -[:ABOUT]-> Intervention:${kind} <-[:HAS_INTERVENTION]- Day <-[:INCLUDES]- Trip`,
      items,
      ...(items.length ? {} : { note: `no prior failures for ${kind}` }),
    };
  } catch {
    return offline();
  }
}

/** Fixed calendar events a day collides with, returned as paths. */
export async function calendarConflicts(dayIndex: number, tenant?: string): Promise<GraphQueryResult> {
  const g = await graph(tenant);
  if (!g) return offline();
  const t0 = Date.now();
  try {
    const res = await g.roQuery(
      `MATCH (d:Day {dayIndex:$dayIndex})-[:CONFLICTS_WITH]->(e:CalendarEvent)
       RETURN e.title AS title, e.startMin AS startMin, e.endMin AS endMin,
              e.fixed AS fixed, d.label AS day`,
      { params: { dayIndex } },
    );
    const items = (res?.data ?? []).map((r: any) => ({
      title: String(r.title ?? ""),
      startMin: Number(r.startMin ?? 0),
      endMin: Number(r.endMin ?? 0),
      fixed: Boolean(r.fixed),
      day: String(r.day ?? ""),
    }));
    return {
      found: items.length > 0,
      rows: items.length,
      ms: Date.now() - t0,
      path: `Day:${dayIndex} -[:CONFLICTS_WITH]-> CalendarEvent`,
      items,
      ...(items.length ? {} : { note: `no calendar conflicts on day ${dayIndex}` }),
    };
  } catch {
    return offline();
  }
}

/** Write path: a real check-in lands in the graph, linked to the intervention
 *  and day it's about when the kind resolves. Mirrors recordCheckIn's JSON
 *  write — the graph stays best-effort and never breaks the route. */
export async function recordCheckInToGraph(checkIn: {
  id?: string;
  dayIndex?: number;
  kind?: string;
  status: string;
  text?: string;
  at: number;
}, tenant?: string): Promise<void> {
  const g = await graph(tenant);
  if (!g) return;
  try {
    if (checkIn.kind && checkIn.dayIndex !== undefined) {
      await g.query(
        `MATCH (i:Intervention {kind:$kind, dayIndex:$dayIndex}), (d:Day {dayIndex:$dayIndex})
         CREATE (c:CheckIn {at:$at, status:$status, text:$text, kind:$kind, session:$session})
         CREATE (c)-[:ABOUT]->(i)
         CREATE (c)-[:ON_DAY]->(d)`,
        {
          params: {
            kind: checkIn.kind,
            dayIndex: checkIn.dayIndex,
            at: checkIn.at,
            status: checkIn.status,
            text: (checkIn.text ?? "").slice(0, 280),
            session: graphSession(),
          },
        },
      );
    } else {
      await g.query(
        `CREATE (c:CheckIn {at:$at, status:$status, text:$text, session:$session})`,
        {
          params: {
            at: checkIn.at,
            status: checkIn.status,
            text: (checkIn.text ?? "").slice(0, 280),
            session: graphSession(),
          },
        },
      );
    }
  } catch {
    // Best-effort: graph memory must never break the run.
  }
}