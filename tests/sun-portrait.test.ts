import { describe, expect, test } from "bun:test";
import { demoJourney, sunSelfForBeat } from "@/domain/demo-beats";
import { sunSelfRead } from "@/domain/sun-self";
import { SUN_PORTRAIT_SIZE, sunPortraitSvg } from "@/lib/sun-portrait";

/* The body-clock portrait (round 25) is the Wrapped-style artifact: one
 * shareable state-portrait. These tests lock its honesty — every word on it
 * traces to a computed read, and the demo portrait can never look better
 * than the demo's own stamp. */

const journey = demoJourney("miles");

describe("sunPortraitSvg", () => {
  const read = sunSelfRead({
    owedMin: 270,
    deliveredMin: 270,
    requiredMin: 540,
    direction: "east",
    daysLocked: 3,
  });

  test("the card is square and speaks the document family", () => {
    const svg = sunPortraitSvg({ read, routeLabel: "LONDON → TOKYO" });
    expect(SUN_PORTRAIT_SIZE.width).toBe(SUN_PORTRAIT_SIZE.height);
    expect(svg).toContain('viewBox="0 0 1080 1080"');
    expect(svg).toContain("MERIDIAN · BODY-CLOCK PORTRAIT");
    expect(svg).toContain("LONDON → TOKYO");
    expect(svg).toContain("TIMING GUIDANCE, NOT MEDICAL ADVICE");
  });

  test("the glyph on the card is exactly the read it was given", () => {
    const svg = sunPortraitSvg({ read, routeLabel: "LONDON → TOKYO" });
    expect((svg.match(/<line /g) ?? []).length).toBe(read.rayCount);
    expect(svg).toContain(`THE TRAVELLER'S MERIDIAN`);
    // half-lit read, faceless (Phase 0): disc + halo, never a drawn face
    expect(svg).not.toContain("sunself-eye");
    expect(svg).toContain(read.line);
  });

  test("the sub label renders only when the caller supplies one", () => {
    const bare = sunPortraitSvg({ read, routeLabel: "LONDON → TOKYO" });
    const subbed = sunPortraitSvg({
      read,
      routeLabel: "LONDON → TOKYO",
      subLabel: "banked 4.5h of 9.0h",
    });
    expect(bare).not.toContain("BANKED");
    expect(subbed).toContain("BANKED 4.5H OF 9.0H");
  });

  test("the demo portrait never outruns the demo stamp", () => {
    const payoff = sunSelfForBeat(journey, "payoff");
    const svg = sunPortraitSvg({
      read: payoff,
      routeLabel: journey.passport?.route ?? "THE TRIP",
    });
    // OWED 4.5h of 9h — the face is lifting/half-lit, never adjusted
    expect(svg).not.toContain("MERIDIAN — ADJUSTED");
    expect(payoff.mood === "adjusted").toBe(false);
    // and the caption names the mood the read actually carries
    expect(svg).toContain(`— ${payoff.mood.toUpperCase().replace("-", "-")}`);
  });

  test("labels are escaped — a route can't inject markup", () => {
    const svg = sunPortraitSvg({ read, routeLabel: `<script>x</script>` });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });
});
