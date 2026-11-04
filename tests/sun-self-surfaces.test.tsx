import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SunSelf } from "@/components/SunSelf";
import { ArrivalPassportCard } from "@/components/ArrivalPassportCard";
import { SolLunaMascot } from "@/components/dial/SolLunaMascot";
import { TodayStage } from "@/components/TodayStage";
import { TripEntryScreen } from "@/components/TripEntryScreen";
import { demoJourney } from "@/domain/demo-beats";
import { buildTrip } from "@/domain/fixtures";
import {
  sunSelfMoodWord,
  sunSelfRead,
  type SunSelfRead,
} from "@/domain/sun-self";
import { sunSelfSvgGroup } from "@/lib/sun-self-svg";
import { arrivalPassportSvg } from "@/lib/arrival-passport-svg";
import { utcOffsetMinOn } from "@/domain/timezones";

/* Round 24: one glyph family, many places — face retired in Phase 0 of the
 * design reset. These tests lock that the exported SVG twin draws the same
 * geometry the component does, that the passport carries the portrait only
 * when a read computed it, that SolLuna's halves carry the misalignment, and
 * that the stage sky and the empty entry each show their honest glyph. */

const PALETTE = {
  disc: "#ffd98a",
  rayLit: "#ffd98a",
  rayDim: "#8b93a7",
  halo: "#ffd98a",
};

const drained: SunSelfRead = sunSelfRead({
  owedMin: 540,
  deliveredMin: 0,
  requiredMin: 540,
  direction: "east",
});
const halfLit: SunSelfRead = sunSelfRead({
  owedMin: 270,
  deliveredMin: 270,
  requiredMin: 540,
  direction: "east",
  daysLocked: 3,
});

describe("the exported twin draws the same faceless glyph", () => {
  test("rays: one line per ray, lit count identical", () => {
    for (const read of [drained, halfLit]) {
      const str = sunSelfSvgGroup(read, { r: 30, palette: PALETTE });
      const dom = renderToStaticMarkup(createElement(SunSelf, { read, size: 64 }));
      const strRays = (str.match(/<line /g) ?? []).length;
      const strLit = (str.match(/sunself-ray lit/g) ?? []).length;
      const domRays = (dom.match(/sunself-ray/g) ?? []).length;
      const domLit = (dom.match(/sunself-ray lit/g) ?? []).length;
      expect(strRays).toBe(domRays);
      expect(strLit).toBe(domLit);
      expect(strRays).toBe(read.rayCount);
      expect(strLit).toBe(read.raysLit);
    }
  });

  test("disc + halo + rays, and no face in either renderer", () => {
    for (const read of [drained, halfLit]) {
      const str = sunSelfSvgGroup(read, { r: 30, palette: PALETTE });
      const dom = renderToStaticMarkup(createElement(SunSelf, { read, size: 64 }));
      // The readout survives as light: disc, halo and rays in both.
      expect(str).toContain("<circle");
      expect(dom).toContain("sunself-disc");
      expect(dom).toContain("sunself-halo");
      // The face is retired: no eyes, lids or mouth anywhere.
      for (const face of ["sunself-eye", "sunself-lid", "sunself-mouth", "sunself-face"]) {
        expect(str).not.toContain(face);
        expect(dom).not.toContain(face);
      }
    }
  });

  test("halo: the glow formula is shared", () => {
    const str = sunSelfSvgGroup(halfLit, { r: 30, palette: PALETTE });
    const dom = renderToStaticMarkup(createElement(SunSelf, { read: halfLit, size: 64 }));
    const bloom = 0.08 + 0.16 * halfLit.lid;
    const expected = (0.12 + halfLit.glow * 0.5 + bloom * 0.3).toFixed(3);
    // Phase 2: the halo is a radial gradient; the state formula rides
    // its outer stop, carried on data-halo for parity checks.
    expect(str).toContain(`data-halo="${expected}"`);
    expect(dom).toContain(`data-halo="${expected}"`);
  });
});

describe("the passport portrait", () => {
  const journey = demoJourney("miles");
  const pp = journey.passport;

  test("a computed read earns a portrait and a caption", () => {
    const svg = arrivalPassportSvg(pp, halfLit);
    expect(svg).toContain("THE TRAVELLER'S MERIDIAN");
    expect(svg).toContain(sunSelfMoodWord(halfLit.mood).toUpperCase());
    expect((svg.match(/<line /g) ?? []).length).toBeGreaterThanOrEqual(halfLit.rayCount);
  });

  test("no read, no portrait — the export never invents a face", () => {
    const svg = arrivalPassportSvg(pp);
    expect(svg).not.toContain("THE TRAVELLER'S MERIDIAN");
  });

  test("the live card carries the same face the export draws", () => {
    const h = renderToStaticMarkup(
      createElement(ArrivalPassportCard, { passport: pp, sun: halfLit }),
    );
    expect(h).toContain("arr-passport-face");
    expect(h).toContain("sunself");
    const bare = renderToStaticMarkup(createElement(ArrivalPassportCard, { passport: pp }));
    expect(bare).not.toContain("arr-passport-face");
  });

  test("the portrait button exists only when a face was computed", () => {
    const withSun = renderToStaticMarkup(
      createElement(ArrivalPassportCard, { passport: pp, sun: halfLit }),
    );
    expect(withSun).toContain("Portrait");
    const without = renderToStaticMarkup(createElement(ArrivalPassportCard, { passport: pp }));
    expect(without).not.toContain("Portrait");
  });
});

describe("SolLuna carries the gap in its halves, not a face", () => {
  test("a wide gap leans the halves apart", () => {
    const h = renderToStaticMarkup(
      createElement(SolLunaMascot, {
        state: "drifting",
        tone: "gentle",
        misalignmentHours: 8,
        baselineMisalignmentHours: 9,
      }),
    );
    expect(h).toContain("rotate(-11"); // drifting split is 22deg, half each way
    expect(h).toContain("rotate(11");
  });

  test("calm closes the split; the two halves stay one body", () => {
    const h = renderToStaticMarkup(
      createElement(SolLunaMascot, {
        state: "calm",
        tone: "gentle",
        misalignmentHours: 0,
        baselineMisalignmentHours: 9,
      }),
    );
    expect(h).toContain("rotate(0 28 28)"); // calm: the two halves sit flush
    // The rim still reads the halves as one body — and there is no face.
    expect(h).toContain('r="22"');
    expect(h).not.toContain("<ellipse");
  });

  test("three rays crown the sun half", () => {
    const h = renderToStaticMarkup(
      createElement(SolLunaMascot, {
        state: "calm",
        tone: "gentle",
        misalignmentHours: 0,
        baselineMisalignmentHours: 9,
      }),
    );
    expect((h.match(/<line /g) ?? []).length).toBe(3);
  });
});

function tripSpanningToday() {
  const utc = new Date();
  const off = utcOffsetMinOn("Europe/London", utc.toISOString().slice(0, 10));
  const todayAtOrigin = new Date(utc.getTime() + off * 60000).toISOString().slice(0, 10);
  return buildTrip("LHR", "HND", todayAtOrigin);
}

describe("the stage sky carries the traveller", () => {
  test("the sun on the horizon is a sun-self, honest about the debt", () => {
    const trip = tripSpanningToday();
    const h = renderToStaticMarkup(
      createElement(TodayStage, {
        trip,
        owedMin: Math.abs(trip.requiredShiftMin),
        bodyShiftMin: 0,
        nudges: null,
        marks: [],
        routeOpen: false,
        onChip: () => {},
        daysLocked: 0,
      }),
    );
    expect(h).toContain("stage-sunself");
    expect(h).toContain("sunself");
    expect(h).toContain("drained"); // full debt on the stage = drained face
    expect(h).not.toContain("sunself-ray lit"); // nothing locked, no rays
  });

  test("locked days light rays on the stage face", () => {
    const trip = tripSpanningToday();
    const h = renderToStaticMarkup(
      createElement(TodayStage, {
        trip,
        owedMin: Math.abs(trip.requiredShiftMin) - 240,
        bodyShiftMin: 240,
        nudges: null,
        marks: [],
        routeOpen: false,
        onChip: () => {},
        daysLocked: 4,
      }),
    );
    expect((h.match(/sunself-ray lit/g) ?? []).length).toBe(4);
  });
});

describe("the entry carries no mascot (Phase 1)", () => {
  test("the form shows no sun at all — the headline above does the talking", () => {
    const h = renderToStaticMarkup(
      createElement(TripEntryScreen, {
        initialDate: "2026-05-10",
        onContinue: () => {},
        onExploreExample: () => {},
      }),
    );
    expect(h).not.toContain("sunself");
    expect(h).not.toContain("entry-sunself");
  });

  test("a resolved draft stays honest — gap line + model preview, no fake mood", () => {
    const h = renderToStaticMarkup(
      createElement(TripEntryScreen, {
        initialDate: "2026-05-10",
        onContinue: () => {},
        onExploreExample: () => {},
        initialRoute: { origin: "LHR", dest: "HND", date: "2026-11-04" },
      }),
    );
    expect(h).toContain("9.0h to move · eastbound"); // the real gap, not a mood
    expect(h).toContain("Model preview — estimated shift coverage");
    expect(h).not.toContain("sunself");
    expect(h).not.toContain("lands");
  });
});
