import { describe, expect, test } from "bun:test";
import {
  EVIDENCE_SEED_TABLE,
  getCitationsForKind,
  getEvidenceForKind,
} from "../src/domain/evidence";
import { CITATION_CATALOGUE, citationById, resolveCitations } from "../src/domain/citations";
import { getMascotCopy } from "../src/domain/mascot";
import { POST_SHIFT_DRIVING_WARNING } from "../src/domain/shift-work";
import type { InterventionKind } from "../src/domain/types";

const KINDS: InterventionKind[] = [
  "light_exposure",
  "avoid_light",
  "sleep_window",
  "nap",
  "caffeine_cutoff",
  "melatonin",
  "exercise",
  "meal_timing",
];

describe("the citation catalogue", () => {
  test("every entry has an id, a title, a year and a resolvable DOI", () => {
    const ids = new Set<string>();
    for (const c of CITATION_CATALOGUE) {
      expect(c.id).toBeTruthy();
      expect(c.title).toBeTruthy();
      expect(c.year).toBeGreaterThan(1900);
      expect(c.doi).toMatch(/^10\.\d{4,9}\//);
      expect(c.url).toContain("doi.org");
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
  });

  test("the four papers the evidence table leans on are in the catalogue", () => {
    for (const id of [
      "eastman-burgess-2009",
      "eastman-2005",
      "bin-2019",
      "aasm-guideline-2015",
    ]) {
      expect(citationById(id)).toBeDefined();
    }
  });

  test("an unknown id resolves to nothing rather than to a broken citation", () => {
    expect(citationById("not-a-paper")).toBeUndefined();
    expect(resolveCitations(["not-a-paper", "bin-2019"])).toHaveLength(1);
  });
});

describe("the evidence seed table", () => {
  test("every intervention kind the domain can emit is covered", () => {
    for (const kind of KINDS) {
      const entry = getEvidenceForKind(kind);
      expect(entry.kind).toBe(kind);
      expect(["moves_clock", "helps_feel_better"]).toContain(entry.channel);
      expect(entry.channelLabel).toBeTruthy();
      expect(entry.mechanismGrade).toBeTruthy();
      expect(entry.fieldGrade).toBeTruthy();
    }
  });

  test("the two channels are the two the product talks about", () => {
    expect(getEvidenceForKind("light_exposure").channel).toBe("moves_clock");
    expect(getEvidenceForKind("caffeine_cutoff").channel).toBe("helps_feel_better");
    expect(getEvidenceForKind("exercise").channel).toBe("helps_feel_better");
  });

  test("every citation id in the table resolves in the shared catalogue", () => {
    for (const entry of Object.values(EVIDENCE_SEED_TABLE)) {
      for (const id of entry.citationIds) {
        expect(citationById(id)).toBeDefined();
      }
    }
  });

  test("the papers behind a nudge come from the run's set when there is one", () => {
    const runCitations = CITATION_CATALOGUE.filter((c) => c.id === "bin-2019");
    const picked = getCitationsForKind("light_exposure", runCitations);
    expect(picked).toHaveLength(1);
    expect(picked[0].id).toBe("bin-2019");
  });

  test("an intervention the table does not know is visibly unknown", () => {
    const unknown = getEvidenceForKind("unlisted_intervention");
    expect(unknown.mechanismGrade).toBe("Unknown");
    expect(unknown.fieldGrade).toBe("Limited");
  });
});

describe("the mascot's voice", () => {
  test("never jokes about a post-shift drive", () => {
    const line = getMascotCopy({
      tone: "cheeky",
      state: "serious",
      misalignmentHours: 4.5,
      baselineMisalignmentHours: 6,
      isShiftPostNightWarning: true,
    });
    expect(line).toContain("Post-night-shift drowsiness");
    expect(line).toContain("safe transport");
    // And the full warning it summarises says where to get real guidance.
    expect(POST_SHIFT_DRIVING_WARNING).toContain("occupational health service");
    expect(POST_SHIFT_DRIVING_WARNING).toContain(
      "cannot assess whether you are fit to drive",
    );
  });

  test("never shames a skipped step", () => {
    const line = getMascotCopy({
      tone: "cheeky",
      state: "droop",
      misalignmentHours: 4.5,
      baselineMisalignmentHours: 6,
      skippedToday: true,
    });
    expect(line.toLowerCase()).not.toContain("fail");
    expect(line.toLowerCase()).not.toContain("should have");
    expect(line).toContain("6.0h");
  });

  test("quotes the number the dial shows, not a mood", () => {
    const line = getMascotCopy({
      tone: "direct",
      state: "syncing",
      misalignmentHours: 2.3,
      baselineMisalignmentHours: 5.1,
    });
    expect(line).toContain("2.3h");
    expect(line).toContain("5.1h");
  });

  test("stays inside the twenty-word budget the daily card holds itself to", () => {
    for (const tone of ["gentle", "cheeky", "direct"] as const) {
      for (const state of ["calm", "syncing", "drifting", "droop"] as const) {
        const line = getMascotCopy({
          tone,
          state,
          misalignmentHours: 3.4,
          baselineMisalignmentHours: 5.5,
        });
        expect(line.split(/\s+/).length).toBeLessThanOrEqual(20);
      }
    }
  });
});
