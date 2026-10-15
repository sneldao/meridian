// Record a crew run from a running dev server into a timestamped fixture that
// lenses can be built against without the pipeline (see src/state/playback.ts).
//
//   bun scripts/record-fixture.ts [origin] [dest] [date] [out]
//   bun scripts/record-fixture.ts LHR HND 2026-10-18 src/state/fixture-events.json

const [origin = "LHR", dest = "HND", date = "2026-10-18", out = "src/state/fixture-events.json"] =
  process.argv.slice(2);
const base = process.env.MERIDIAN_URL ?? "http://localhost:3000";

const res = await fetch(`${base}/api/crew/run?origin=${origin}&dest=${dest}&date=${date}`);
if (!res.ok || !res.body) throw new Error(`run failed: ${res.status}`);

const t0 = Date.now();
const events: { t: number; event: unknown }[] = [];
const decoder = new TextDecoder();
let buf = "";
for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
  buf += decoder.decode(chunk, { stream: true });
  let idx;
  while ((idx = buf.indexOf("\n\n")) >= 0) {
    const frame = buf.slice(0, idx);
    buf = buf.slice(idx + 2);
    const line = frame.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue;
    const event = JSON.parse(line.slice(6));
    events.push({ t: Date.now() - t0, event });
    if (event.type === "done") break;
  }
}

await Bun.write(out, JSON.stringify({ route: `${origin}-${dest}`, date, recordedAt: new Date().toISOString(), events }, null, 1));
console.log(`${events.length} events, ${((Date.now() - t0) / 1000).toFixed(1)}s → ${out}`);
