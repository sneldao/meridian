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
  sunSelfSleeping,
  type SunSelfRead,
} from "@/domain/sun-self";
import { sunSelfSvgGroup } from "@/lib/sun-self-svg";
import { arrivalPassportSvg } from "@/lib/arrival-passport-svg";
import { utcOffsetMinOn } from "@/domain/timezones";

/* Round 24: one face family, many places. These tests lock that the
 * exported SVG twin draws the same geometry the component does, that the
 * passport carries the portrait only when a read computed it, that SolLuna's
 * sun half obeys the same lids law, and that the stage sky and the empty
 * entry each show their honest face. */

const PALETTE = {
  disc: "#ffd98a",
  face: "#0b0e16",
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

describe("the exported twin draws the same face", () => {
  test("rays: one line per ray, lit count identical", () => {
    for (const read of [drained, halfLit]) {
      const str = sunSelfSvgGroup(read, { r: 30, palette: PALETTE });
      const dom = renderToStaticMarkup(createElement(SunSelf, { read, size: 64 }));
      const strRays = (str.match(/<line /g) ?? []).length;
      const strLit = (str.match(/stroke="#ffd98a" stroke-width="3"/g) ?? []).length;
      const domRays = (dom.match(/sunself-ray/g) ?? []).length;
      const domLit = (dom.match(/sunself-ray lit/g) ?? []).length;
      expect(strRays).toBe(domRays);
      expect(strLit).toBe(domLit);
      expect(strRays).toBe(read.rayCount);
      expect(strLit).toBe(read.raysLit);
    }
  });

  test("lids: both renderers close at the same threshold", () => {
    const strDrained = sunSelfSvgGroup(drained, { r: 30, palette: PALETTE });
    const domDrained = renderToStaticMarkup(createElement(SunSelf, { read: drained, size: 64 }));
    expect(strDrained).not.toContain("<ellipse");
    expect(domDrained).not.toContain("sunself-eye");
    expect(strDrained).toContain("Q 48 59.5");
    expect(domDrained).toContain("sunself-lid");

    const strHalf = sunSelfSvgGroup(halfLit, { r: 30, palette: PALETTE });
    const domHalf = renderToStaticMarkup(createElement(SunSelf, { read: halfLit, size: 64 }));
    expect(strHalf).toContain("<ellipse");
    expect(domHalf).toContain("sunself-eye");
  });

  test("halo: the glow formula is shared", () => {
    const str = sunSelfSvgGroup(halfLit, { r: 30, palette: PALETTE });
    const dom = renderToStaticMarkup(createElement(SunSelf, { read: halfLit, size: 64 }));
    const expected = (0.12 + halfLit.glow * 0.5).toFixed(3);
    expect(str).toContain(`opacity="${expected}"`);
    expect(dom).toContain(`opacity="${Number((0.12 + halfLit.glow * 0.5).toFixed(3))}"`);
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
});

describe("SolLuna speaks the sun-self's language", () => {
  test("a wide gap closes the sun-side lid", () => {
    const h = renderToStaticMarkup(
      createElement(SolLunaMascot, {
        state: "drifting",
        tone: "gentle",
        misalignmentHours: 8,
        baselineMisalignmentHours: 9,
      }),
    );
    expect(h).toContain("Q 35 33.2"); // closed-lid arc on the sun side
    expect(h).not.toContain('cx="35"'); // no open sun-side eye
    expect(h).toContain('cx="21"'); // the moon side keeps its dot
  });

  test("a small gap keeps the sun-side eye open", () => {
    const h = renderToStaticMarkup(
      createElement(SolLunaMascot, {
        state: "syncing",
        tone: "gentle",
        misalignmentHours: 1,
        baselineMisalignmentHours: 9,
      }),
    );
    expect(h).toContain('cx="35"');
    expect(h).not.toContain("Q 35 33.2");
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

describe("the empty entry sleeps, it does not sulk", () => {
  test("no route yet shows the sleeping face", () => {
    const h = renderToStaticMarkup(
      createElement(TripEntryScreen, {
        initialDate: "2026-05-10",
        onContinue: () => {},
        onExploreExample: () => {},
        onExploreScenario: () => {},
      }),
    );
    expect(h).toContain("entry-sunself");
    const sleeping = sunSelfSleeping();
    expect(h).toContain(sunSelfMoodWord(sleeping.mood)); // "asleep"
    expect(h).toContain("No route yet");
  });
});
