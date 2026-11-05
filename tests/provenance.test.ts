import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { provenanceChips, type ProvenanceChip } from "../src/domain/provenance";
import { PerformanceBrief } from "../src/components/PerformanceBrief";
import { buildTrip } from "../src/domain/fixtures";

/* Step 3 — the plan header names every signal it used. Each chip's text
 * is a real fact: the route read is the trip's own arithmetic, the
 * light/conflicts/crate chips quote the crew's account verbatim, the
 * calendar chip counts the events the plan bent around and names their
 * source. What can't be proven isn't shown. */

const east = buildTrip("LHR", "HND", "2026-05-10"); // −480 requiredShiftMin
const west = buildTrip("LHR", "JFK", "2026-05-10"); // +300

const find = (chips: ProvenanceChip[], source: string) =>
  chips.find((c) => c.source === source);

describe("provenanceChips", () => {
  it("derives the route and signed body-clock gap from the trip itself", () => {
    const chips = provenanceChips({ trip: east, calendarCount: 0, calendarSource: "fixture" });
    expect(find(chips, "Route")?.detail).toBe("8h eastbound");
    expect(find(chips, "Body clock")?.detail).toBe("−8h");

    const w = provenanceChips({ trip: west, calendarCount: 0, calendarSource: "fixture" });
    expect(find(w, "Route")?.detail).toBe("5h westbound");
    expect(find(w, "Body clock")?.detail).toBe("+5h");
  });

  it("quotes the crew's account rows verbatim — the facts the build produced", () => {
    const chips = provenanceChips({
      trip: east,
      calendarCount: 3,
      calendarSource: "fixture",
      accountRows: [
        { id: "route", secondary: "8h eastbound" },
        { id: "light", secondary: "5 across 3 days" },
        { id: "conflicts", secondary: "2 flagged" },
        { id: "crate", secondary: "2 entities · 3 places" },
      ],
    });
    expect(find(chips, "Light")?.detail).toBe("5 across 3 days");
    expect(find(chips, "Conflicts")?.detail).toBe("2 flagged");
    expect(find(chips, "Crate")?.detail).toBe("2 entities · 3 places");
    // The route row is superseded by the trip's own read — same fact, one chip.
    expect(chips.filter((c) => c.source === "Route").length).toBe(1);
  });

  it("an honest failure row stays honest — it is still what the build said", () => {
    const chips = provenanceChips({
      trip: east,
      calendarCount: 0,
      calendarSource: "fixture",
      accountRows: [
        { id: "light", secondary: "the solver could not place this route" },
        { id: "conflicts", secondary: "the scan needs the crew" },
        { id: "crate", secondary: "no crate packed" },
      ],
    });
    expect(find(chips, "Light")?.detail).toBe("the solver could not place this route");
    expect(find(chips, "Crate")?.detail).toBe("no crate packed");
  });

  it("names the calendar's source — the user's meetings vs the fixture's", () => {
    expect(
      find(provenanceChips({ trip: east, calendarCount: 0, calendarSource: "google" }), "Calendar")?.detail,
    ).toBe("none");
    expect(
      find(provenanceChips({ trip: east, calendarCount: 3, calendarSource: "google" }), "Calendar")?.detail,
    ).toBe("3 meetings");
    // The fixture is not the traveller's calendar — the chip says so
    // rather than borrowing the user's authority.
    expect(
      find(provenanceChips({ trip: east, calendarCount: 3, calendarSource: "fixture" }), "Calendar")?.detail,
    ).toBe("3 example meetings");
  });

  it("URL restore: omits what the trip alone cannot prove", () => {
    // No account rows and no crate state — light, conflicts and crate
    // stay off the row rather than being guessed.
    const chips = provenanceChips({ trip: east, calendarCount: 1, calendarSource: "fixture" });
    expect(find(chips, "Light")).toBeUndefined();
    expect(find(chips, "Conflicts")).toBeUndefined();
    expect(find(chips, "Crate")).toBeUndefined();
    expect(chips.map((c) => c.source)).toEqual(["Route", "Body clock", "Calendar"]);
  });

  it("derives the crate from real taste state when no account row exists", () => {
    const chips = provenanceChips({
      trip: east,
      calendarCount: 0,
      calendarSource: "fixture",
      crate: { entities: 2, places: 3 },
    });
    expect(find(chips, "Crate")?.detail).toBe("2 entities · 3 places");
    const empty = provenanceChips({
      trip: east,
      calendarCount: 0,
      calendarSource: "fixture",
      crate: { entities: 0 },
    });
    expect(find(empty, "Crate")?.detail).toBe("none packed");
  });

  it("no trip, no row — a plan that isn't there claims no signals", () => {
    expect(provenanceChips({ trip: null, calendarCount: 5, calendarSource: "google" })).toEqual([]);
  });
});

describe("provenance chips under the stamped header", () => {
  it("the chips slot renders beneath the title line inside the brief", () => {
    const chips = provenanceChips({ trip: east, calendarCount: 0, calendarSource: "fixture" });
    const html = renderToStaticMarkup(
      createElement(
        PerformanceBrief,
        { moment: null, destination: "Tokyo", example: true },
        createElement(
          "ul",
          { className: "prov-chips" },
          chips.map((c) =>
            createElement(
              "li",
              { key: c.source, className: "prov-chip" },
              createElement("span", { className: "prov-chip-src" }, c.source),
              c.detail,
            ),
          ),
        ),
      ),
    );
    const title = html.indexOf("perf-brief-heading");
    const row = html.indexOf("prov-chips");
    expect(title).toBeGreaterThan(-1);
    expect(row).toBeGreaterThan(title);
    expect(html).toContain("prov-chip-src");
    expect(html).toContain("8h eastbound");
    expect(html).toContain("−8h");
  });
});
