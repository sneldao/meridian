<!-- FROZEN — ICP research from the 2026-10 hackathon. Still the source of the demo fixtures. -->

# ICP — who the night shift serves

Two personas. **ICP-1 is the wedge** (revenue, frequent-flyer spend). **ICP-2 is
the insight** — she is a real customer interview, and her answer shaped the
product's core claim.

## ICP-1 · Alex — the wedge

**Alex, 34 — strategy consultant.** London-based, flies LHR→HND (or similar
long-haul east) roughly quarterly for client weeks. The week of travel is the
week performance matters most — which is exactly when jet lag hits.

- Wears a **Garmin**. Has the data, never acts on it.
- **Late chronotype** — bed ~23:55, up ~06:45, 6h50 average. HRV stable.
- **Calendar-driven** — will do what the calendar says; won't do what an app
  merely suggests.
- **Compliance floor: 07:00.** History shows anything scheduled earlier gets
  ignored. One strike for early asks; evenings are where adherence is won.
- Travels enough to feel the problem, pays for tools that demonstrably save
  trips (airport lounges, Timeshifter-class spend is in budget).

## The pain we're solving

Not "tell me about jet lag" — the market for advice is dead on arrival (our
own interview: *"wouldn't pay for it, wouldn't adhere"*). The pain is that the
plan requires effort at the exact moment the traveller has the least capacity.
Meridian's wedge: **a crew that does the doing** — reads the baseline, pulls
the science, negotiates the calendar, and keeps replanning when reality
deviates.

## Why this ICP demos well

- Every judge has flown east and suffered. Instantly relatable.
- The wearable + calendar inputs are legible on screen — the crew's decisions
  trace to visible evidence.
- The compliance floor makes the "adherence engine" tangible: the scorer
  literally penalizes plans this person won't follow.
- Commercial honesty: per-trip subscription to start; the same engine expands
  to team travel (sports squads, cabin crew, exec travel).

## Demo fixture mapping

| Fixture | Encodes |
|---|---|
| `GARMIN_BASELINE` | Late chronotype, 6h50 avg, stable HRV |
| `ADHERENCE_PROFILE` | Compliance floor 07:00, weak at early alarms |
| `CALENDAR` / seeded Google events | Fixed meetings w/ attendees vs movable personal blocks |
| `DEMO_TRIP` | LHR → HND, −8h eastward (London on BST), departs 2026-10-18 |

## ICP-2 · Valentina — the insight

**Valentina, mid-20s — student.** Mexican, in London for her degree. Works
hard on her studies, worries about her sleep and stress, and flies home
LHR→MEX to visit family — a 6–7h *westward* delay, the opposite shift from
Alex.

Interviewed this morning. Her verdict on wellness advice: **wouldn't pay for
it, wouldn't adhere to it.** That answer is the product. Meridian doesn't
sell advice — it sells a crew that does the doing and adapts when adherence
fails.

- **Wears a Garmin** — the wearable data is already there.
- **Stress-aware, not performance-obsessed** — her motivation is feeling
  okay, not peak output. Softer sell: "your trip home shouldn't cost you the
  first three days."
- **Price-sensitive** — not the revenue wedge; the expansion + evidence that
  the problem generalises beyond execs.
- **Westward shift exercises the other half of the scorer** — delay plans,
  evening light, sleep-in windows. LHR→MEX is already demoable (MEX is in
  the airport table).

## Demo mapping

| Persona | Trip | Scorer path | Story |
|---|---|---|---|
| Alex | LHR → HND (−8h, advance) | morning light anchors, caffeine cutoff | the wedge — exec travel |
| Valentina | LHR → MEX (−6h, delay) | evening light, delayed windows | the insight — adherence engine |

Pitches lead with Alex (commercial), land the Valentina line as the origin
story: *"We asked her if she'd pay for advice or follow it. She said no to
both. So we didn't build advice."*
