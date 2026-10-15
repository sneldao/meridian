export {};
// Smoke check against a running dev server: bun run dev then bun run smoke
const BASE = "http://localhost:3000/api/crew/run";

interface Ev {
  type: string;
  day?: { label: string };
}

async function readRun(url: string): Promise<Ev[]> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status} (${url})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    body += decoder.decode(value, { stream: true });
  }
  const events = [...body.matchAll(/^data: (.*)$/gm)].map((m) => JSON.parse(m[1]) as Ev);
  if (!events.some((e) => e.type === "done")) throw new Error("never received done event");
  return events;
}

// Night shift: the full run.
const night = await readRun(BASE);
console.log("smoke ok - night events:", night.length);

// Morning shift: start at D-1 with one check-in. Must stream check_in + replan
// and must not re-lock the dropped days.
const checkIns = [
  { id: "smoke-1", dayIndex: 1, kind: "light_exposure", startMin: 5 * 60, status: "skipped", text: "skipped the 5am light", at: Date.now() },
];
const param = encodeURIComponent(Buffer.from(JSON.stringify(checkIns)).toString("base64"));
const morning = await readRun(`${BASE}?startDay=2&checkins=${param}`);
const types = morning.map((e) => e.type);
if (!types.includes("check_in")) throw new Error("morning run emitted no check_in event");
if (!types.includes("replan")) throw new Error("morning run emitted no replan event");
const locked = morning.filter((e) => e.type === "day_locked").map((e) => e.day?.label);
if (locked.some((l) => l === "D-3" || l === "D-2")) {
  throw new Error(`morning replan re-locked dropped days: ${locked.join(", ")}`);
}
if (locked.length === 0) throw new Error("morning replan locked no days");
console.log("smoke ok - morning events:", morning.length, "locked:", locked.join(", "));
