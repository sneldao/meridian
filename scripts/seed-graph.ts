/* eslint-disable @typescript-eslint/no-explicit-any */
// Seeds the FalkorDB memory plane for the Graph Hacks track.
//
//   bun run seed:graph            # seed MERIDIAN_GRAPH_ID (default meridian:demo)
//   bun run seed:graph --reset    # wipe the graph first
//   SEED_TENANT=other bun run seed:graph   # seed the second tenant (isolation demo)

import { FalkorDB } from "falkordb";
import { seedGraph, wipeGraph } from "../src/domain/graph-seed";

const URL = process.env.FALKORDB_URL ?? "falkor://localhost:6379";
const TENANT = process.env.SEED_TENANT ?? "demo";
const GRAPH = process.env.MERIDIAN_GRAPH_ID ?? `meridian:${TENANT}`;
const RESET = process.argv.includes("--reset");

async function main() {
  const db = await (FalkorDB as any).connect({ url: URL });
  const g = db.selectGraph(GRAPH);

  if (RESET) {
    await wipeGraph(g);
    console.log(`wiped ${GRAPH}`);
  }

  const nodes = await seedGraph(g, TENANT === "other" ? "other" : "demo");
  console.log(`Seeded ${GRAPH} on ${URL.replace(/\/\/([^:]+):[^@]+@/, "//$1:***@")} — nodes: ${nodes}`);
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
