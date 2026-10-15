# Hackathon plan — Accel AI Innovate London

**Date:** Thu 2026-10-15 · **Team:** 4 devs + pitch lead · **Submit:** 15:00 · **Top 8 pitch:** 16:00

**TL;DR** — Demo the crew working, not a cinematic. **The world is the event
stream:** every agent event has exactly one visible consequence, and nothing
moves unless an agent moved it. One run state, four lenses (World · Shift Board
· Calendar · Ledger), any route on Earth, and a clear buyer: companies with a
duty of care for staff who fly long-haul. The long-term vision lives in
[design-vision.md](design-vision.md); this doc is what ships today.

---

## 1. Judging criteria → what we show

| Criterion | What judges see |
|---|---|
| **Real output** | The `.ics` imported into a real Google / Apple calendar on stage; the Calendar lens shows the before/after diff of the user's actual week. |
| **Agent design** (plan, handoff, recover) | Visible handoffs between agents; Iris's gate rejects a draft (`CALENDAR_CONFLICT`, adherence floor) and Otto redraws it ("attempt 2/2"); the Ledger shows every raw event. |
| **Long-running** | Mission clock and counters (elapsed, tool calls, attempts). The **morning check-in beat**: fast-forward to "D-2 07:10", the check-in says "skipped 05:00 light", future rows break apart, the crew re-reads the user's history and replans. Agents working *across days* and learning. |
| **Business viability** | The meeting-readiness score (§4) and the team view (§5, stretch): the ROI is on screen, not only on a slide. |
| **Demo** | Run it live on the Anthropic provider; replay as a hot fallback; a pre-recorded sped-up multi-day run, labelled as sped up. |

---

## 2. Locations — yes, fully customisable (dev A)

Today: 6 hardcoded cities (`CITY_TABLE` in `src/domain/fixtures.ts`), each with
a **fixed** UTC offset. Problems that matter on stage:

1. **DST is ignored.** London is on BST (UTC+1) until 25 Oct 2026, so LHR → HND
   this week is **8 h, not 9 h**. A London judge can spot this.
2. **No wrap-around.** `requiredShiftMin = origin − destination` with no
   ±12 h wrap: SFO → SIN computes a 16 h eastward advance instead of an 8 h delay.
3. **The replay transcript is route-coupled** (London / Tokyo strings in
   `src/agents/replay.ts`), so a custom route in replay mode tells the wrong story.
4. **The hero copy is hardcoded** (`SunTrack.tsx`, the idle text in `page.tsx`).

Fix:
- Store an **IANA time zone** per city; compute offsets for each plan day with
  `Intl.DateTimeFormat` (no new dependency). DST changes mid-trip come out right.
- Wrap the shift into −12 h…+12 h; when it's close to 12 h, pick the direction by
  preference (delays are easier to achieve than advances).
- **Airport search:** a bundled JSON of about 300 major airports (code, name,
  lat, lon, tz) built from OurAirports (public domain) plus IANA zones. A
  type-ahead combobox replaces the `<select>`s; the World lens also accepts a
  click to set origin and destination.
- Template the replay with `{origin}` / `{dest}` / `{shiftH}` so every route
  tells a true story offline.
- Stretch: paste a flight confirmation email → the crew extracts the route
  (another visible agent step).

## 3. Views — one run state, four lenses

Every lens reads one `RunState` built by a reducer over the event stream. The
lenses are camera angles on the same run and update live mid-run.

| Lens | Answers | Driven by |
|---|---|---|
| **World** | *Where is my body?* Flat map with the real day/night line, the **Ghost Terminator** (your body's dawn, 120° behind Tokyo this week), the flight great-circle arc, both cities. The ghost moves east **only** on `day_locked`. | `run_start`, `day_locked`, trip |
| **Shift Board** (hero) | *What changes, hour by hour?* 5 rows × 24 h. Room 1: your week now (London-time sleep, scattered events). Room 2: aligned to the destination, with the sleep staircase. Drafts appear see-through, Iris's scan line sweeps, failures bounce back with the rule code, passes snap solid. | `plan_candidate`, `eval_result`, `day_locked` |
| **Calendar** | *What happens to my real week?* A week view of actual events with before/after: Rex's moves slide, fixed commitments show as anchors, and each destination meeting gets a **readiness badge** (§4). Ends with the `.ics`. | `calendar_move`, `briefing` |
| **Ledger** | *Prove it.* The raw event log with timestamps, tool calls, verdicts and attempts. For judges and for trust. | everything |

**Director mode (default during the demo):** the app switches lens
automatically by event: `citation` → World, `plan_candidate` / `eval_result` →
Shift Board, `calendar_move` → Calendar. A manual switch (keys 1–4) overrides it.

Event → consequence mapping (no backend change; all of these already exist in
`src/agents/runtime.ts`):

| Event | Consequence |
|---|---|
| `run_start` | Board appears with home-time sleep bars; world shows both terminators |
| `agent_start` / `agent_end` | The agent's marker lights up at its station |
| `tool_call` / `tool_result` | A pulse travels from the agent to the object it touches, with the tool name shown |
| `citation` | An evidence card drops into Jun's tray |
| `plan_candidate` | See-through draft blocks on that day's row |
| `eval_result` FAIL | Scan line sweeps, the offending block flashes with its rule code and bounces back, "attempt n/2" |
| `eval_result` PASS | Draft turns solid |
| `day_locked` | The row snaps in, the staircase grows, the ghost terminator moves east |
| `calendar_move` | An event block slides around its anchors |
| `error` (recoverable) | Shown as a visible recovery |
| `replan` | Future rows dissolve and re-plan (the check-in beat) |
| `briefing` / `done` | Handoff; `.ics` download |

## 4. Commercial promise — the case to make

**Market.** 1.84 B business trips and **$1.71 T** business-travel spend
forecast for 2026 ([GBTA](https://gbta.org/global-business-travel-spending-to-hit-record-1-71-trillion-in-2026-while-trips-reach-1-84-billion-says-gbta-forecast)).

**Proof of willingness to pay.** Timeshifter, the incumbent, is embedded with
United and partnered with oneworld ([oneworld](https://www.oneworld.com/news/oneworld-partners-with-popular-app-timeshifter-to-help-travellers-beat-jet-lag)),
and sells $9.99/plan or $24.99/yr to consumers. Airlines and alliances already
pay for jet-lag tooling.

**Wedge — why Meridian is different.** Incumbents produce *advice*. Meridian's
crew **does the work**: it moves your meetings, watches your wearable,
replans every morning from what you actually did, and every plan passes a
deterministic physiological check. It's an executive assistant for your body
clock, not a PDF of tips.

**First customer.** Companies with a duty of care for staff who fly
long-haul: deal teams, consultancies, banks, sports teams. **Buyer:** travel
manager, HR, or the executive's assistant. **User:** the traveller.

**On-screen ROI — meeting readiness (build today; deterministic, cheap).**
For each destination meeting, compute the body-clock time at that moment
(local time − remaining shift). If it falls near the body's low point (about
02:00–06:00 body time), show it red: *"Board meeting D+1 09:00 — your body
thinks it's 02:00. Rex suggests 14:00."* That turns circadian science into a
number a buyer understands.

**Pricing hypothesis (say it as a hypothesis):** about £20–30 per traveller per
month, B2B seats, plus a per-trip tier for consumers. Distribution through
travel-management companies and airline premium cabins later.

**Pitch claims to avoid:** the "£/$337 M a year lost to jet lag in the UK"
figure is a 2016 number cited second-hand; don't use it unless we find the
primary source.

## 5. Team view — stretch, but our strongest closer (dev D)

A travel manager's dashboard: *"12 people flying to Tokyo for the Q4 close."*
Six to twelve crews run **in parallel**, each traveller a tile with their own
ghost line, attempts and readiness badges. This shows long-running agents
**working as a team at scale**, plus the buyer's view, plus the business model,
in one screen. Build it on replay so it's deterministic; show one tile live.

---

## 6. Team split — non-overlapping files

Work in separate branches or worktrees. **The working tree already has
uncommitted changes from parallel work** (`circadian.ts`, the check-in route,
morning-agent files); merge those first.

| Dev | Owns | Files (new unless noted) |
|---|---|---|
| **A — Core & routes** (critical path) | `RunState` reducer + `useCrewRun()` hook; **recorded event-log fixture plus a scrubber** so B/C/D can build without running the pipeline; IANA tz, shift wrap, airport search, replay templating; Tier-0 fixes (hardcoded copy, "dateline" copy, favicon, `themeColor` warning) | `src/state/run.ts`, `src/state/fixture-events.json`, `src/domain/fixtures.ts`*, `src/agents/replay.ts`*, `src/data/airports.json`, `src/components/RoutePicker.tsx` |
| **B — Shift Board** (hero) | Board, drafts, Iris scan, bounce on FAIL, staircase, agent pulses | `src/components/lenses/ShiftBoard.tsx` |
| **C — World + shell** | World lens (terminator maths, ghost line, flight arc), lens switcher, director mode, mission clock and counters, overlay layout in `page.tsx` | `src/components/lenses/WorldLens.tsx`, `src/components/LensShell.tsx`, `src/app/page.tsx`* |
| **D — Calendar + business** | Calendar lens with before/after, readiness badges, Ledger lens, live `.ics` import rehearsal; then the team view (stretch) | `src/components/lenses/CalendarLens.tsx`, `src/components/lenses/Ledger.tsx`, `src/domain/readiness.ts`, `src/app/team/page.tsx` |
| **Pitch lead** | Story, 3 slides (problem → live demo → business), recorded backup, rehearsal timing | — |

\* existing file

**The contract dev A must publish first (in about 30 min):**
```ts
interface RunState {
  trip: Trip; phase: "idle" | "running" | "done";
  activeAgent?: AgentId; clockMs: number; toolCalls: number;
  drafts: Map<string, { plan: DayPlan; attempt: number }>;
  verdicts: Map<string, EvalResult[]>;
  locked: Map<string, DayPlan>;
  moves: CalendarMove[]; citations: Citation[];
  lastEvent?: CrewEvent; log: CrewEvent[];
}
```

## 7. Timeline (London time)

| Time | Milestone |
|---|---|
| now → +30 min | A: `RunState`, hook and fixture published. B/C/D: scaffold lenses against the fixture. |
| → 13:45 | Lenses built (eat at desks). A: routes, DST and wrap, replay templating. |
| 13:45–14:15 | Integrate in `page.tsx`, director mode, the check-in beat. |
| **14:15** | **Feature freeze.** |
| 14:15–14:45 | Two full live rehearsals on Anthropic; record the sped-up backup; tune `BEAT`. |
| 14:45–15:00 | Submit (repo, video, description). |
| 15:00–16:00 | Pitch rehearsal: demo path on a custom route the judges choose, if live is stable. |

## 8. Demo script (3 min)

1. **Hook (15 s).** "It's 11:30 in your body. It's 19:30 in Tokyo." Ask a judge for a destination.
2. **Launch (15 s).** Pick the route on the map; start the night shift.
3. **The crew at work (90 s).** Director mode: citations onto the world, drafts onto the board, a **rejection and recovery** at Iris's gate, days locking, the ghost line moving east, Rex moving meetings.
4. **Long-running (30 s).** Fast-forward to the D-2 morning check-in → replan.
5. **Real output (20 s).** Import the `.ics` into a real calendar; readiness badges go from red to green.
6. **Business (10 s).** Team view: 12 travellers, 12 crews. "£25 a seat; the buyer is whoever owns duty of care."

## 9. Cut for today

3D globe, Window Seat, generative sound, light-signature poster, oscillator
model. They go on one "where this goes" slide.
