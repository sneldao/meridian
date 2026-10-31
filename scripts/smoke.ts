export {};
// Smoke check against a running dev server: bun run dev then bun run smoke
const BASE = `${process.env.SMOKE_BASE ?? "http://localhost:3000"}/api/crew`;
const RUN = `${BASE}/run`;
const ANSWERS = `${BASE}/answers`;

interface Ev {
  type: string;
  provider?: string;
  day?: { label: string };
  question?: { id: string; options?: { id: string }[] };
}

// SSE lines arrive interleaved in chunks — parse incrementally so a
// crew_question can be answered while the run is still suspended on it.
async function readRun(url: string, opts?: { answerQuestions?: boolean }): Promise<Ev[]> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status} (${url})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events: Ev[] = [];
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data: ")) continue;
      const e = JSON.parse(line.slice(6)) as Ev;
      events.push(e);
      if (opts?.answerQuestions && e.type === "crew_question" && e.question?.id) {
        const optionId = e.question.options?.[0]?.id;
        const r = await fetch(ANSWERS, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: e.question.id, optionId }),
        });
        if (!r.ok) throw new Error(`crew answer failed: ${r.status}`);
      }
    }
  }
  if (!events.some((e) => e.type === "done")) throw new Error("never received done event");
  return events;
}

// Night shift: the full run.
const night = await readRun(RUN, { answerQuestions: true });
console.log("smoke ok - night events:", night.length);

// Crew question contract. Replay can't pause, so a scripted run correctly
// never asks; a live provider must ask (fresh eastward run, floor 07:00)
// and must resume on the answer.
const provider = night.find((e) => e.type === "run_start")?.provider;
const types = night.map((e) => e.type);
if (provider === "replay") {
  if (types.includes("crew_question")) {
    throw new Error("replay run emitted crew_question — scripted runs must never ask");
  }
  console.log("smoke ok - replay provider: no crew question, as designed");
} else {
  if (!types.includes("crew_question")) throw new Error(`live run (${provider}) emitted no crew_question`);
  if (!types.includes("crew_answer")) throw new Error("crew_question was never resolved — no crew_answer");
  console.log(`smoke ok - ${provider} provider: crew question asked and answered`);
}

// Morning shift: start at D-1 with one check-in. Must stream check_in + replan
// and must not re-lock the dropped days.
const checkIns = [
  { id: "smoke-1", dayIndex: 1, kind: "light_exposure", startMin: 5 * 60, status: "skipped", text: "skipped the 5am light", at: Date.now() },
];
const param = encodeURIComponent(Buffer.from(JSON.stringify(checkIns)).toString("base64"));
const morning = await readRun(`${RUN}?startDay=2&checkins=${param}`);
const mtypes = morning.map((e) => e.type);
if (!mtypes.includes("check_in")) throw new Error("morning run emitted no check_in event");
if (!mtypes.includes("replan")) throw new Error("morning run emitted no replan event");
const locked = morning.filter((e) => e.type === "day_locked").map((e) => e.day?.label);
if (locked.some((l) => l === "D-3" || l === "D-2")) {
  throw new Error(`morning replan re-locked dropped days: ${locked.join(", ")}`);
}
if (locked.length === 0) throw new Error("morning replan locked no days");
console.log("smoke ok - morning events:", morning.length, "locked:", locked.join(", "));
