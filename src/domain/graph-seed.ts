/* eslint-disable @typescript-eslint/no-explicit-any */
// Seed data for the FalkorDB memory plane — shared by scripts/seed-graph.ts
// (local) and POST /api/graph/seed (deployed, where the graph is internal-only).
//
// Scenario: one eastward London → Tokyo trip across two sessions. run-1 holds
// the previous trip's check-ins and findings — that's what run-2 recalls.
// The "other" tenant is a different traveller so per-graph isolation shows.

async function q(graph: any, query: string, params?: Record<string, unknown>) {
  await graph.query(query, params ? { params } : undefined);
}

async function seedDemo(g: any) {
  // --- Trip skeleton -------------------------------------------------------
  await q(
    g,
    `MERGE (t:Trip {id:'lon-tokyo-oct'})
     SET t.label='London → Tokyo', t.direction='east', t.tzGap=9`,
  );

  const days = [
    { dayIndex: 0, label: "D-3", date: "2026-10-22", shiftMin: -60 },
    { dayIndex: 1, label: "D-2", date: "2026-10-23", shiftMin: -60 },
    { dayIndex: 2, label: "D-1", date: "2026-10-24", shiftMin: -60 },
    { dayIndex: 3, label: "Flight", date: "2026-10-25", shiftMin: 0 },
    { dayIndex: 4, label: "D+1", date: "2026-10-26", shiftMin: -45 },
  ];
  for (const d of days) {
    await q(
      g,
      `MATCH (t:Trip {id:'lon-tokyo-oct'})
       MERGE (d:Day {dayIndex:$dayIndex})
       SET d.label=$label, d.date=$date, d.shiftMin=$shiftMin
       MERGE (t)-[:INCLUDES]->(d)`,
      d );
  }

  // --- Interventions (kind + label so entity resolution can name them) -----
  const interventions: [number, string, string, number][] = [
    [0, "light_exposure", "morning light", 405], // 06:45
    [0, "caffeine_cutoff", "caffeine cutoff", 840], // 14:00
    [1, "light_exposure", "early light", 360], // 06:00
    [1, "melatonin", "melatonin", 1320], // 22:00 — timing only, never a dose
    [2, "light_exposure", "early light", 330], // 05:30
    [2, "caffeine_cutoff", "caffeine cutoff", 810], // 13:30
    [4, "nap", "afternoon nap", 960], // 16:00
    [4, "sleep_window", "sleep window", 1380], // 23:00
  ];
  for (const [dayIndex, kind, label, startMin] of interventions) {
    await q(
      g,
      `MATCH (d:Day {dayIndex:$dayIndex})
       MERGE (i:Intervention {kind:$kind, dayIndex:$dayIndex})
       SET i.label=$label, i.startMin=$startMin
       MERGE (d)-[:HAS_INTERVENTION]->(i)`,
      { dayIndex, kind, label, startMin },
    );
  }

  // --- Calendar conflicts ---------------------------------------------------
  await q(
    g,
    `MATCH (d:Day {dayIndex:2})
     MERGE (e:CalendarEvent {title:'Investor call', dayIndex:2})
     SET e.startMin=330, e.endMin=390, e.fixed=true
     MERGE (d)-[:CONFLICTS_WITH]->(e)`,
  );
  await q(
    g,
    `MATCH (d:Day {dayIndex:1})
     MERGE (e:CalendarEvent {title:'Team standup', dayIndex:1})
     SET e.startMin=570, e.endMin=600, e.fixed=false
     MERGE (d)-[:CONFLICTS_WITH]->(e)`,
  );

  // --- Citations ------------------------------------------------------------
  const citations = [
    ["cite-burgess", "Evening and morning bright light phase shifts", "J Biol Rhythms"],
    ["cite-prc", "Phase-response curve for timed melatonin", "Sleep Med Rev"],
    ["cite-caf", "Caffeine timing and sleep onset in phase advance", "J Clin Sleep Med"],
  ];
  for (const [id, title, venue] of citations) {
    await q(
      g,
      `MERGE (c:Citation {id:$id}) SET c.title=$title, c.venue=$venue`,
      { id, title, venue },
    );
  }
  await q(
    g,
    `MATCH (i:Intervention {kind:'light_exposure', dayIndex:1}), (c:Citation {id:'cite-burgess'})
     MERGE (i)-[:CITES]->(c)`,
  );
  await q(
    g,
    `MATCH (i:Intervention {kind:'melatonin', dayIndex:1}), (c:Citation {id:'cite-prc'})
     MERGE (i)-[:CITES]->(c)`,
  );
  await q(
    g,
    `MATCH (i:Intervention {kind:'caffeine_cutoff', dayIndex:2}), (c:Citation {id:'cite-caf'})
     MERGE (i)-[:CITES]->(c)`,
  );

  // --- run-1 check-ins: what actually happened last trip --------------------
  const checkIns = [
    [1, "light_exposure", "skipped", "couldn't face the 06:00 light"],
    [2, "light_exposure", "skipped", "05:30 light ask failed again"],
    [2, "caffeine_cutoff", "harder", "afternoon meetings, coffee ran late"],
    [4, "nap", "done", "20 min, felt fine"],
  ] as const;
  for (const [dayIndex, kind, status, text] of checkIns) {
    await q(
      g,
      `MATCH (i:Intervention {kind:$kind, dayIndex:$dayIndex}), (d:Day {dayIndex:$dayIndex})
       CREATE (c:CheckIn {at:$at, status:$status, text:$text, kind:$kind, session:'run-1'})
       CREATE (c)-[:ABOUT]->(i)
       CREATE (c)-[:ON_DAY]->(d)`,
      { dayIndex, kind, status, text, at: 1760e9 + dayIndex * 864e5 },
    );
  }

  // --- run-1 findings: what the crew learned --------------------------------
  const findings: [string, number][] = [
    ["Early light asks before 07:00 are unreliable for this traveller", 1],
    ["Caffeine cutoff slips when afternoon meetings cluster", 2],
    ["Short naps before 16:30 were tolerated without hurting the sleep window", 4],
  ];
  for (const [text, dayIndex] of findings) {
    await q(
      g,
      `MATCH (d:Day {dayIndex:$dayIndex})
       CREATE (f:Finding {text:$text, at:$at, session:'run-1'})
       CREATE (f)-[:ABOUT]->(d)`,
      { dayIndex, text, at: 1760e9 + dayIndex * 864e5 + 36e5 },
    );
  }

  // --- Baseline the analyst reads -------------------------------------------
  await q(
    g,
    `MATCH (t:Trip {id:'lon-tokyo-oct'})
     MERGE (a:AdherenceProfile {id:'demo'})
     SET a.chronotype='moderate evening', a.earliestReliableMin=420
     MERGE (t)-[:HAS_PROFILE]->(a)`,
  );
  await q(
    g,
    `MERGE (w:WearableBaseline {id:'demo'})
     SET w.source='garmin', w.habitualSleepMin=1410, w.habitualWakeMin=420`,
  );
}

async function seedOther(g: any) {
  // A different traveller on a different trip — exists so the demo can show
  // that one graph's memory never leaks into another's.
  await q(
    g,
    `MERGE (t:Trip {id:'nyc-lon-nov'})
     SET t.label='New York → London', t.direction='west', t.tzGap=5`,
  );
  await q(
    g,
    `MATCH (t:Trip {id:'nyc-lon-nov'})
     MERGE (d:Day {dayIndex:0}) SET d.label='D-2', d.date='2026-11-10'
     MERGE (t)-[:INCLUDES]->(d)`,
  );
  await q(
    g,
    `MATCH (d:Day {dayIndex:0})
     MERGE (i:Intervention {kind:'exercise', dayIndex:0})
     SET i.label='evening exercise', i.startMin=1080
     MERGE (d)-[:HAS_INTERVENTION]->(i)`,
  );
  await q(
    g,
    `MATCH (i:Intervention {kind:'exercise', dayIndex:0})
     CREATE (c:CheckIn {at:1770e9, status:'skipped', text:'skipped the evening run', kind:'exercise', session:'run-1'})
     CREATE (c)-[:ABOUT]->(i)`,
  );
  await q(
    g,
    `MATCH (d:Day {dayIndex:0})
     CREATE (f:Finding {text:'Evening exercise pushes this traveller bedtime later', at:1770e9+36e5, session:'run-1'})
     CREATE (f)-[:ABOUT]->(d)`,
  );
}



export async function seedGraph(g: any, tenant: "demo" | "other" = "demo"): Promise<number> {
  if (tenant === "other") await seedOther(g);
  else await seedDemo(g);
  const count = await g.roQuery("MATCH (n) RETURN count(n) AS nodes");
  return Number(count?.data?.[0]?.nodes ?? 0);
}

export async function wipeGraph(g: any): Promise<void> {
  await g.query("MATCH (n) DETACH DELETE n");
}
