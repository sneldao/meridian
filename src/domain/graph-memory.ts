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

function graphId(): string {
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

export async function graph(): Promise<any | null> {
  const c = await client();
  if (!c) return null;
  return c.selectGraph(graphId());
}

export interface GraphMemory {
  enabled: boolean;
  findings: { text: string; at: number; session: string; target?: string }[];
  failures: { kind: string; status: string; text?: string; at: number }[];
}

export async function loadGraphMemory(): Promise<GraphMemory> {
  const g = await graph();
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

export async function recordFinding(text: string, target = "meridian", session = "current"): Promise<void> {
  const g = await graph();
  if (!g) return;
  try {
    await g.query(
      "MERGE (x:Subject {name:$target}) CREATE (f:Finding {text:$text, at:$at, session:$session}) CREATE (f)-[:ABOUT]->(x)",
      { params: { target, text: text.slice(0, 280), at: Date.now(), session } },
    );
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