/* eslint-disable @typescript-eslint/no-explicit-any */
import { FalkorDB } from "falkordb";

const URL = process.env.FALKORDB_URL ?? "falkor://localhost:6379";
const GRAPH = process.env.MERIDIAN_GRAPH_ID ?? "meridian:demo";

async function q(graph: any, query: string, params?: Record<string, unknown>) {
  try {
    await graph.query(query, params ? { params } : undefined);
  } catch (err) {
    console.error("query failed:", query, err instanceof Error ? err.message : err);
  }
}

async function main() {
  const db = await (FalkorDB as any).connect({ url: URL });
  const g = db.selectGraph(GRAPH);

  await q(g, "MERGE (s:Subject {name:'meridian'})");
  await q(g, "MERGE (i:Intervention {kind:'light_exposure', label:'morning light'})");
  await q(g, "MERGE (c:CheckIn {at:1700000000000, status:'skipped', text:'skipped the 6am light', kind:'light_exposure'})");
  await q(g, "MERGE (f:Finding {text:'Early light asks before 07:00 are unreliable for this traveller', at:1700000001000, session:'run-1'})");
  await q(g, "MATCH (c:CheckIn {at:1700000000000}), (i:Intervention {kind:'light_exposure'}) MERGE (c)-[:ABOUT]->(i)");
  await q(g, "MATCH (f:Finding {at:1700000001000}), (s:Subject {name:'meridian'}) MERGE (f)-[:ABOUT]->(s)");
  console.log(`Seeded graph ${GRAPH} on ${URL}`);
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});